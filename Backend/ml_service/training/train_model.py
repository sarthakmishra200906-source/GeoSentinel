"""Train a deterministic flood-probability baseline using only the Python stdlib."""

from __future__ import annotations

import csv
import hashlib
import json
import math
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
ARCHIVE = ROOT / "data" / "kaggle" / "playground-series-s4e5.zip"
MODEL_PATH = ROOT / "Backend" / "ml_service" / "model" / "flood-risk-baseline.json"
TARGET = "FloodProbability"


def solve_linear_system(matrix: list[list[float]], vector: list[float]) -> list[float]:
    size = len(vector)
    augmented = [row[:] + [vector[index]] for index, row in enumerate(matrix)]
    for column in range(size):
        pivot = max(range(column, size), key=lambda row: abs(augmented[row][column]))
        if abs(augmented[pivot][column]) < 1e-12:
            raise ValueError("Training matrix is singular; model cannot be trained")
        augmented[column], augmented[pivot] = augmented[pivot], augmented[column]
        divisor = augmented[column][column]
        augmented[column] = [value / divisor for value in augmented[column]]
        for row in range(size):
            if row == column:
                continue
            factor = augmented[row][column]
            augmented[row] = [
                current - factor * pivot_value
                for current, pivot_value in zip(augmented[row], augmented[column])
            ]
    return [augmented[index][-1] for index in range(size)]


def risk_tier(probability: float) -> str:
    if probability >= 0.7:
        return "CRITICAL"
    if probability >= 0.5:
        return "HIGH"
    if probability >= 0.4:
        return "MODERATE"
    return "LOW"


def main() -> int:
    if not ARCHIVE.exists():
        print(f"Dataset not found: {ARCHIVE}", file=sys.stderr)
        return 1

    xxt = [[0.0] * 21 for _ in range(21)]
    xyt = [0.0] * 21
    test_rows: list[tuple[list[float], float]] = []
    feature_names: list[str] = []
    row_count = 0
    train_count = 0
    test_count = 0
    feature_bounds: dict[str, dict[str, float]] = {}

    with zipfile.ZipFile(ARCHIVE) as archive:
        csv_name = next(name for name in archive.namelist() if Path(name).name == "train.csv")
        with archive.open(csv_name, "r") as compressed:
            reader = csv.DictReader((line.decode("utf-8-sig") for line in compressed))
            if not reader.fieldnames or TARGET not in reader.fieldnames:
                raise ValueError(f"{TARGET} is not present in the dataset")
            feature_names = [name for name in reader.fieldnames if name not in {"id", TARGET}]
            if len(feature_names) != 20:
                raise ValueError(f"Expected 20 features, found {len(feature_names)}")

            for row in reader:
                row_count += 1
                features = [float(row[name]) for name in feature_names]
                for name, value in zip(feature_names, features):
                    if name not in feature_bounds:
                        feature_bounds[name] = {"min": value, "max": value}
                    else:
                        feature_bounds[name]["min"] = min(feature_bounds[name]["min"], value)
                        feature_bounds[name]["max"] = max(feature_bounds[name]["max"], value)
                values = [1.0, *features]
                target = float(row[TARGET])
                row_id = int(row["id"])
                if row_id % 5 == 0:
                    test_rows.append((values, target))
                    test_count += 1
                    continue
                train_count += 1
                for left, left_value in enumerate(values):
                    xyt[left] += left_value * target
                    for right, right_value in enumerate(values):
                        xxt[left][right] += left_value * right_value

    coefficients = solve_linear_system(xxt, xyt)
    errors: list[float] = []
    absolute_errors: list[float] = []
    tier_counts: dict[str, int] = {}
    for values, target in test_rows:
        prediction = max(0.0, min(1.0, sum(a * b for a, b in zip(coefficients, values))))
        error = prediction - target
        errors.append(error * error)
        absolute_errors.append(abs(error))
        tier_counts[risk_tier(prediction)] = tier_counts.get(risk_tier(prediction), 0) + 1

    model_version = "flood-risk-baseline-2026-11-11"
    metadata = {
        "model_version": model_version,
        "algorithm": "ordinary_least_squares",
        "target": TARGET,
        "features": feature_names,
        "feature_units": {name: "dataset score; source units not specified" for name in feature_names},
        "feature_bounds": feature_bounds,
        "training_rows": train_count,
        "test_rows": test_count,
        "dataset_rows": row_count,
        "test_split": "id % 5 == 0",
        "metrics": {
            "rmse": math.sqrt(sum(errors) / len(errors)),
            "mae": sum(absolute_errors) / len(absolute_errors),
        },
        "prediction_tiers": tier_counts,
        "dataset_sha256": hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(),
        "dataset_source": "Kaggle Playground Series S4E5 competition archive",
        "status": "baseline; not a calibrated operational alert model",
        "coefficients": coefficients,
    }
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    MODEL_PATH.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(metadata, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
