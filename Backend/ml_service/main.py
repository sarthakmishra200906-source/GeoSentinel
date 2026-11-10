import json
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
    if any(not isinstance(value, (int, float)) for value in request.features.values()):
        raise HTTPException(status_code=422, detail="All feature values must be numeric")
    values = [1.0] + [request.features[name] for name in expected]
    probability = max(
        0.0,
        min(1.0, sum(a * b for a, b in zip(model["coefficients"], values))),
    )
    return {
        "probability": probability,
        "risk_tier": classify(probability),
        "status": "SIMULATED",
        "model_version": model["model_version"],
        "feature_timestamp": request.feature_timestamp,
        "input_status": "DATASET_FEATURES",
        "warnings": ["Baseline model is not calibrated for operational alerts."],
    }
