import json
from datetime import datetime, timezone, timedelta
import math
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Resq-AI ML Service", version="0.1.0")
MODEL_PATH = Path(__file__).parent / "model" / "flood-risk-baseline.json"
model = json.loads(MODEL_PATH.read_text(encoding="utf-8")) if MODEL_PATH.exists() else None


class PredictionRequest(BaseModel):
    features: dict[str, float]
    feature_timestamp: str | None = None


def classify(probability: float) -> str:
    if probability >= 0.7:
        return "CRITICAL"
    if probability >= 0.5:
        return "HIGH"
    if probability >= 0.4:
        return "MODERATE"
    return "LOW"


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "model": model["model_version"] if model else "not loaded",
    }


@app.post("/predict")
def predict(request: PredictionRequest) -> dict[str, object]:
    if model is None:
        raise HTTPException(status_code=503, detail="Flood-risk model is not trained")
    expected = model["features"]
    if set(request.features) != set(expected):
        raise HTTPException(status_code=422, detail="Feature names do not match model schema")
    if any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in request.features.values()):
        raise HTTPException(status_code=422, detail="All feature values must be numeric")
    bounds = model.get("feature_bounds", {})
    out_of_range = [
        name
        for name, value in request.features.items()
        if name in bounds and (value < bounds[name]["min"] or value > bounds[name]["max"])
    ]
    timestamp = None
    if request.feature_timestamp:
        try:
            timestamp = datetime.fromisoformat(request.feature_timestamp.replace("Z", "+00:00"))
        except ValueError as error:
            raise HTTPException(status_code=422, detail="feature_timestamp must be ISO-8601") from error
        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)
        if timestamp > datetime.now(timezone.utc) + timedelta(minutes=2):
            raise HTTPException(status_code=422, detail="feature_timestamp cannot be in the future")
    if out_of_range:
        unavailable = {
            "probability": None,
            "risk_tier": None,
            "status": "UNAVAILABLE",
            "model_version": model["model_version"],
            "feature_timestamp": request.feature_timestamp,
            "input_status": "OUT_OF_RANGE",
            "warnings": [f"Out-of-range features: {', '.join(out_of_range)}"],
        }
        unavailable.update({
            "riskTier": None,
            "modelVersion": unavailable["model_version"],
            "featureTimestamp": unavailable["feature_timestamp"],
            "inputStatus": unavailable["input_status"],
        })
        return unavailable
    values = [1.0] + [request.features[name] for name in expected]
    probability = max(
        0.0,
        min(1.0, sum(a * b for a, b in zip(model["coefficients"], values))),
    )
    status = "SIMULATED"
    warnings = ["Baseline model is not calibrated for operational alerts."]
    if timestamp and (datetime.now(timezone.utc) - timestamp).total_seconds() > 24 * 60 * 60:
        status = "STALE"
        warnings.append("Feature data is older than 24 hours.")
    result = {
        "probability": probability,
        "risk_tier": classify(probability),
        "status": status,
        "model_version": model["model_version"],
        "feature_timestamp": request.feature_timestamp,
        "input_status": "DATASET_FEATURES",
        "warnings": warnings,
    }
    result.update({
        "riskTier": result["risk_tier"],
        "modelVersion": result["model_version"],
        "featureTimestamp": result["feature_timestamp"],
        "inputStatus": result["input_status"],
    })
    return result
