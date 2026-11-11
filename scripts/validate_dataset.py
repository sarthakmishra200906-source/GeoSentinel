"""Validate the Kaggle archive without requiring pandas or model dependencies."""

from __future__ import annotations

import csv
import hashlib
import json
import sys
import zipfile
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "data" / "kaggle" / "playground-series-s4e5.zip"
REPORT = ROOT / "data" / "dataset_report.json"
TARGET_CANDIDATES = ("FloodProbability", "flood_probability", "target", "label")


def parse_number(value: str) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def main() -> int:
    if not ARCHIVE.exists():
        print(f"Dataset archive not found: {ARCHIVE}", file=sys.stderr)
        return 1

    with zipfile.ZipFile(ARCHIVE) as archive:
        csv_names = [name for name in archive.namelist() if name.lower().endswith(".csv")]
        required_csvs = {"train.csv", "test.csv", "sample_submission.csv"}
        csv_basenames = {Path(name).name for name in csv_names}
        if not required_csvs.issubset(csv_basenames):
            print(f"Expected {sorted(required_csvs)}, found: {sorted(csv_basenames)}", file=sys.stderr)
            return 1

        datasets = {}
        for csv_name in csv_names:
            basename = Path(csv_name).name
            with archive.open(csv_name, "r") as compressed:
                reader = csv.DictReader((line.decode("utf-8-sig") for line in compressed))
                if not reader.fieldnames:
                    print(f"{basename} has no header", file=sys.stderr)
                    return 1

                columns = list(reader.fieldnames)
                target = next((name for name in TARGET_CANDIDATES if name in columns), None)
                null_counts = Counter()
                value_ranges: dict[str, dict[str, float | int | None]] = {}
                row_count = 0
                duplicate_ids = 0
                seen_ids: set[str] = set()
                for row in reader:
                    row_count += 1
                    row_id = row.get("id")
                    if row_id:
                        if row_id in seen_ids:
                            duplicate_ids += 1
                        seen_ids.add(row_id)
                    for column in columns:
                        value = (row.get(column) or "").strip()
                        if not value:
                            null_counts[column] += 1
                            continue
                        number = parse_number(value)
                        if number is None:
                            continue
                        bounds = value_ranges.setdefault(column, {"min": number, "max": number})
                        bounds["min"] = min(float(bounds["min"]), number)
                        bounds["max"] = max(float(bounds["max"]), number)
                datasets[basename] = {
                    "row_count": row_count,
                    "column_count": len(columns),
                    "columns": columns,
                    "target_candidate": target,
                    "duplicate_id_count": duplicate_ids,
                    "missing_values": dict(null_counts),
                    "numeric_ranges": value_ranges,
                }

    train_report = datasets["train.csv"]
    report = {
        "archive": str(ARCHIVE.relative_to(ROOT)),
        "archive_sha256": hashlib.sha256(ARCHIVE.read_bytes()).hexdigest(),
        "datasets": datasets,
        "decision": (
            "Training target confirmed as FloodProbability; feature schema is complete."
            if train_report["target_candidate"] == "FloodProbability"
            and not train_report["missing_values"]
            and train_report["duplicate_id_count"] == 0
            else "Training requires manual review of target, missing values, or duplicate IDs."
        ),
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
