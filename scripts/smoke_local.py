"""Run dependency-free smoke checks against locally running services."""

from __future__ import annotations

import json
import sys
import time
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

    registration_body = {
        "name": "Local Smoke User",
        "email": f"smoke-{int(time.time())}@example.com",
        "phone": f"9{int(time.time()) % 1000000000:09d}",
        "password": "LocalSmokePassword!123",
        "age": 30,
        "gender": "Other",
        "address": "Local smoke test",
    }
    registration = request(
        f"{BACKEND}/api/auth/register",
        method="POST",
        body=json.dumps(registration_body).encode(),
        headers={"Content-Type": "application/json"},
    )
    ordinary_token = None
    if registration[0] == 201:
        ordinary_token = json.loads(registration[2]).get("token")
    ordinary_headers = {"Authorization": f"Bearer {ordinary_token}"} if ordinary_token else {}

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
            "admin mutations reject missing auth",
            lambda: request(
                f"{BACKEND}/api/admin/guidelines",
                method="POST",
                body=b"{}",
                headers={"Content-Type": "application/json"},
            )[0]
            == 401,
        ),
        check(
            "chat rejects missing auth",
            lambda: request(
                f"{BACKEND}/api/chat/message",
                method="POST",
                body=b'{"message":"Where is the nearest shelter?"}',
                headers={"Content-Type": "application/json"},
            )[0]
            == 401,
        ),
        check(
            "rescue-center mutations reject missing auth",
            lambda: request(
                f"{BACKEND}/api/rescue-centers",
                method="POST",
                body=b"{}",
                headers={"Content-Type": "application/json"},
            )[0]
            == 401,
        ),
        check(
            "ordinary user registration works for authorization test",
            lambda: registration[0] == 201 and bool(ordinary_token),
        ),
        check(
            "ordinary users cannot access admin guidelines",
            lambda: ordinary_token is not None
            and request(f"{BACKEND}/api/admin/guidelines", headers=ordinary_headers)[0] == 403,
        ),
        check(
            "ordinary users cannot mutate rescue centers",
            lambda: ordinary_token is not None
            and request(
                f"{BACKEND}/api/rescue-centers",
                method="POST",
                body=b"{}",
                headers={**ordinary_headers, "Content-Type": "application/json"},
            )[0]
            == 403,
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
