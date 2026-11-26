import json
from datetime import datetime, timezone, timedelta
import math
from pathlib import Path

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="Resq-AI ML Service", version="0.1.0")
MODEL_PATH = Path(__file__).parent / "model" / "flood-risk-baseline.json"
TELEMETRY_MODEL_PATH = Path(__file__).parent / "model" / "telemetry-risk.json"
model = json.loads(MODEL_PATH.read_text(encoding="utf-8")) if MODEL_PATH.exists() else None
telemetry_model = (
    json.loads(TELEMETRY_MODEL_PATH.read_text(encoding="utf-8"))
    if TELEMETRY_MODEL_PATH.exists()
    else None
)
TELEMETRY_FEATURES = {
    "precipitation_sum",
    "rain_72h",
    "wind_speed_10m_max",
    "surface_pressure_mean",
    "river_discharge",
}


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


def telemetry_assessment(features: dict[str, float]) -> tuple[float, float, dict[str, float]]:
    rain_limit = telemetry_model.get("rain_95th_percentile_mm", 80) if telemetry_model else 80
    discharge_limit = telemetry_model.get("river_discharge_95th_percentile", 2000) if telemetry_model else 2000
    rain = min(max(features["precipitation_sum"] / max(rain_limit, 1), 0), 1)
    rain_72h = min(max(features["rain_72h"] / max(rain_limit * 3, 1), 0), 1)
    wind = min(max(features["wind_speed_10m_max"] / 100, 0), 1)
    pressure = min(max((1013 - features["surface_pressure_mean"]) / 35, 0), 1)
    discharge = min(max(features["river_discharge"] / max(discharge_limit, 1), 0), 1)
    rain_outlook = max(0.0, min(1.0, 0.4 * rain_72h + 0.6 * rain))
    active_flood_risk = max(0.0, min(1.0, 0.4 * rain + 0.4 * discharge + 0.1 * pressure + 0.1 * wind))
    return active_flood_risk, rain_outlook, {
        "observed_rain_signal": round(rain, 4),
        "river_signal": round(discharge, 4),
        "pressure_signal": round(pressure, 4),
        "wind_signal": round(wind, 4),
    }


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "model": model["model_version"] if model else "not loaded",
    }


@app.get("/model-info")
def model_info() -> dict[str, object]:
    """Expose the exact loaded artifacts, trainers and documentation.

    This makes it possible to inspect what the service is actually running
    without reading the source files. No API keys or live credentials are
    returned here.
    """
    return {
        "apiVersion": app.version,
        "floodBaseline": model,
        "telemetryRisk": telemetry_model,
        "trainingScripts": [
            "Backend/ml_service/training/train_model.py",
            "Backend/ml_service/training/train_telemetry_model.py",
        ],
        "documentation": "Backend/ml_service/README.md",
        "runtimeFiles": ["Backend/ml_service/main.py"],
        "note": "No local chat model is trained; chat uses FAQ cache, approved-document RAG, and a remote provider.",
    }


@app.post("/predict")
def predict(request: PredictionRequest) -> dict[str, object]:
    is_telemetry = set(request.features) == TELEMETRY_FEATURES
    if model is None and not is_telemetry:
        raise HTTPException(status_code=503, detail="Flood-risk model is not trained")
    expected = sorted(TELEMETRY_FEATURES) if is_telemetry else model["features"]
    if set(request.features) != set(expected):
        raise HTTPException(status_code=422, detail="Feature names do not match model schema")
    if any(not isinstance(value, (int, float)) or not math.isfinite(value) for value in request.features.values()):
        raise HTTPException(status_code=422, detail="All feature values must be numeric")
    bounds = {} if is_telemetry else model.get("feature_bounds", {})
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
            "model_version": "telemetry-risk-v1-proxy" if is_telemetry else model["model_version"],
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
    if is_telemetry:
        probability, rain_outlook, factors = telemetry_assessment(request.features)
        model_version = telemetry_model.get("model_version", "telemetry-risk-v1-proxy") if telemetry_model else "telemetry-risk-v1-proxy"
        input_status = "LIVE_OPEN_METEO_TELEMETRY"
        status = "LIVE"
        warnings = [
            "Risk score uses physical telemetry thresholds and proxy labels; calibrate with verified flood observations.",
            "Rain outlook and active flood risk are separate signals.",
        ]
    else:
        values = [1.0] + [request.features[name] for name in expected]
        probability = max(0.0, min(1.0, sum(a * b for a, b in zip(model["coefficients"], values))))
        model_version = model["model_version"]
        input_status = "LEGACY_DATASET_FEATURES"
        status = "SIMULATED"
        warnings = ["Legacy Kaggle baseline is not calibrated for operational alerts."]
    if timestamp and (datetime.now(timezone.utc) - timestamp).total_seconds() > 24 * 60 * 60:
        status = "STALE"
        warnings.append("Feature data is older than 24 hours.")
    result = {
        "probability": probability,
        "risk_tier": classify(probability),
        "status": status,
        "model_version": model_version,
        "feature_timestamp": request.feature_timestamp,
        "input_status": input_status,
        "warnings": warnings,
    }
    if is_telemetry:
        result.update(
            {
                "rain_outlook": rain_outlook,
                "rain_outlook_tier": classify(rain_outlook),
                "active_flood_risk": probability,
                "active_flood_risk_tier": classify(probability),
                "risk_factors": factors,
            }
        )
    result.update({
        "riskTier": result["risk_tier"],
        "modelVersion": result["model_version"],
        "featureTimestamp": result["feature_timestamp"],
        "inputStatus": result["input_status"],
    })
    return result
