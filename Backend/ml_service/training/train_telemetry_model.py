"""Calibrate physical telemetry thresholds from Open-Meteo historical data.

The generated model is intentionally a threshold model until verified flood labels
are available. It uses river-discharge and rainfall percentile thresholds rather
than pretending that synthetic labels are observed flood events.
"""

from __future__ import annotations

import csv
import io
import json
import urllib.parse
import urllib.request
from pathlib import Path


MODEL_PATH = Path(__file__).resolve().parents[1] / "model" / "telemetry-risk.json"
LOCATIONS = [
    ("Bhubaneswar", 20.2961, 85.8245),
    ("Cuttack", 20.4625, 85.8830),
    ("Balasore", 21.4934, 86.9135),
    ("Guwahati", 26.1445, 91.7362),
    ("Kochi", 9.9312, 76.2673),
]


def fetch_csv(base_url: str, params: dict[str, str]) -> list[dict[str, str]]:
    query = urllib.parse.urlencode(params)
    with urllib.request.urlopen(f"{base_url}?{query}", timeout=60) as response:
        text = response.read().decode("utf-8")
    lines = text.splitlines()
    header_index = next(
        (index for index, line in enumerate(lines) if line.startswith("time,")),
        None,
    )
    if header_index is None:
        raise ValueError(f"CSV response from {base_url} has no time-series header")
    reader = csv.DictReader(io.StringIO("\n".join(lines[header_index:])))
    rows = []
    for row in reader:
        normalized = {}
        for key, value in row.items():
            normalized[key.split(" (", 1)[0].strip()] = value
        if normalized.get("time"):
            rows.append(normalized)
    return rows


def percentile(values: list[float], fraction: float) -> float:
    ordered = sorted(values)
    if not ordered:
        return 0.0
    return ordered[min(len(ordered) - 1, int((len(ordered) - 1) * fraction))]


def main() -> None:
    discharge: list[float] = []
    rainfall: list[float] = []
    for _name, latitude, longitude in LOCATIONS:
        common = {
            "latitude": str(latitude),
            "longitude": str(longitude),
            "start_date": "2015-01-01",
            "end_date": "2025-12-31",
            "format": "csv",
        }
        weather_rows = fetch_csv(
            "https://archive-api.open-meteo.com/v1/archive",
            {**common, "daily": "precipitation_sum,rain_sum,wind_speed_10m_max,surface_pressure_mean"},
        )
        flood_rows = fetch_csv(
            "https://flood-api.open-meteo.com/v1/flood",
            {**common, "daily": "river_discharge"},
        )
        rainfall.extend(float(row.get("precipitation_sum") or 0) for row in weather_rows)
        discharge.extend(float(row.get("river_discharge") or 0) for row in flood_rows)

    model = {
        "model_version": "telemetry-risk-v1",
        "algorithm": "percentile-threshold-calibration",
        "features": [
            "precipitation_sum",
            "rain_72h",
            "wind_speed_10m_max",
            "surface_pressure_mean",
            "river_discharge",
        ],
        "rain_95th_percentile_mm": percentile(rainfall, 0.95),
        "river_discharge_95th_percentile": percentile(discharge, 0.95),
        "training_locations": [location[0] for location in LOCATIONS],
        "training_period": ["2015-01-01", "2025-12-31"],
        "training_rows": {"rainfall": len(rainfall), "river_discharge": len(discharge)},
        "label_status": "proxy thresholds; requires verified flood observations for supervised calibration",
    }
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    MODEL_PATH.write_text(json.dumps(model, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(model, indent=2))


if __name__ == "__main__":
    main()
