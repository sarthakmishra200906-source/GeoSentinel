"""Validate the Kaggle archive without requiring pandas or model dependencies."""

from __future__ import annotations

import csv
import json
import sys
import zipfile
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / "train.csv.zip"
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
        if len(csv_names) != 1:
            print(f"Expected exactly one CSV, found: {csv_names}", file=sys.stderr)
            return 1

        with archive.open(csv_names[0], "r") as compressed:
            reader = csv.DictReader((line.decode("utf-8-sig") for line in compressed))
            if not reader.fieldnames:
                print("CSV has no header", file=sys.stderr)
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
                    bounds = value_ranges.setdefault(
                        column, {"min": number, "max": number}
                    )
                    bounds["min"] = min(float(bounds["min"]), number)
                    bounds["max"] = max(float(bounds["max"]), number)

    report = {
        "archive": str(ARCHIVE.relative_to(ROOT)),
        "csv": csv_names[0],
        "row_count": row_count,
        "column_count": len(columns),
        "columns": columns,
        "target_candidate": target,
        "target_confirmed": False,
        "duplicate_id_count": duplicate_ids,
        "missing_values": dict(null_counts),
        "numeric_ranges": value_ranges,
        "decision": (
            "Target requires manual confirmation before training."
            if target
            else "No supported target column was detected; training is blocked."
        ),
    }
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
