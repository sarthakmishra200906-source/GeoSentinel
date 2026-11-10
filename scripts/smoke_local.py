"""Run dependency-free smoke checks against locally running services."""

from __future__ import annotations

import json
import sys
import urllib.error
import urllib.request
from collections.abc import Callable


BACKEND = "http://127.0.0.1:5000"
ML = "http://127.0.0.1:8000"
FRONTEND = "http://127.0.0.1:5173/GeoSentinel/"


def request(
    url: str,
    method: str = "GET",
    body: bytes | None = None,
    headers: dict[str, str] | None = None,
) -> tuple[int, dict[str, str], bytes]:
    request_object = urllib.request.Request(
        url, data=body, headers=headers or {}, method=method
    )
    try:
        with urllib.request.urlopen(request_object, timeout=10) as response:
            return response.status, dict(response.headers), response.read()
    except urllib.error.HTTPError as error:
        return error.code, dict(error.headers), error.read()


def check(name: str, action: Callable[[], bool]) -> bool:
    try:
        passed = action()
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"[FAIL] {name}: {error}")
        return False
    print(f"[{'PASS' if passed else 'FAIL'}] {name}")
    return passed


def main() -> int:
    model_path = "Backend/ml_service/model/flood-risk-baseline.json"
    try:
        with open(model_path, encoding="utf-8") as model_file:
            model = json.load(model_file)
        valid_features = {name: 1 for name in model["features"]}
    except (OSError, KeyError, json.JSONDecodeError):
        valid_features = None

    results = [
        check(
            "frontend responds",
            lambda: request(FRONTEND)[0] == 200,
        ),
        check(
            "backend health responds with request ID",
            lambda: (
                (status := request(
                    f"{BACKEND}/api/health",
                    headers={"x-request-id": "smoke-health-001"},
                ))[0]
                == 200
                and status[1].get("x-request-id") == "smoke-health-001"
                and json.loads(status[2])["status"] == "ok"
            ),
        ),
        check(
            "backend readiness is explicit",
            lambda: request(f"{BACKEND}/api/ready")[0] in (200, 503),
        ),
        check(
            "protected route rejects missing auth",
            lambda: request(f"{BACKEND}/api/auth/me")[0] == 401,
        ),
        check(
            "invalid report is rejected",
            lambda: request(
                f"{BACKEND}/api/reports",
                method="POST",
                body=b"{}",
                headers={"Content-Type": "application/json"},
            )[0]
            == 400,
        ),
        check(
            "invalid weather tile is rejected",
            lambda: request(f"{BACKEND}/api/weather/tiles/nope/0/0/0.png")[0]
            == 400,
        ),
        check(
            "ML health responds",
            lambda: request(f"{ML}/health")[0] == 200,
        ),
        check(
            "ML valid prediction returns a typed result",
            lambda: valid_features is not None
            and (
                result := request(
                    f"{ML}/predict",
                    method="POST",
                    body=json.dumps({"features": valid_features}).encode(),
                    headers={"Content-Type": "application/json"},
                )
            )[0]
            == 200
            and "risk_tier" in json.loads(result[2])
            and "model_version" in json.loads(result[2]),
        ),
        check("ML invalid prediction input is rejected", lambda: request(
            f"{ML}/predict",
            method="POST",
            body=b'{"features": {}}',
            headers={"Content-Type": "application/json"},
        )[0] in (422, 503)),
    ]
    passed = sum(results)
    print(f"\n{passed}/{len(results)} smoke checks passed")
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
