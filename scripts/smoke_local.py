"""Run dependency-free smoke checks against locally running services."""

from __future__ import annotations

import json
import argparse
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import quote
from collections.abc import Callable
from pathlib import Path


BACKEND = "http://127.0.0.1:5000"
ML = "http://127.0.0.1:8000"
FRONTEND = "http://localhost:5173/GeoSentinel/"


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
    except urllib.error.URLError as error:
        return 0, {}, json.dumps({"error": str(error.reason)}).encode()


def check(name: str, action: Callable[[], bool]) -> bool:
    try:
        passed = action()
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"[FAIL] {name}: {error}")
        return False
    print(f"[{'PASS' if passed else 'FAIL'}] {name}")
    return passed


def json_request(
    url: str, method: str = "GET", payload: dict | None = None
) -> tuple[int, dict]:
    body = json.dumps(payload).encode() if payload is not None else None
    status, _, raw = request(
        url,
        method=method,
        body=body,
        headers={"Content-Type": "application/json"} if body else None,
    )
    try:
        return status, json.loads(raw)
    except json.JSONDecodeError:
        return status, {}


def show_live_result(name: str, status: int, payload: dict) -> None:
    preview = json.dumps(payload, ensure_ascii=True)
    if len(preview) > 500:
        preview = f"{preview[:500]}..."
    print(f"\n[LIVE] {name} HTTP {status}\n{preview}")


def main() -> int:
    global BACKEND, ML, FRONTEND
    default_backend = BACKEND
    default_ml = ML
    default_frontend = FRONTEND
    parser = argparse.ArgumentParser(description="Check live local GeoSentinel services.")
    parser.add_argument("--backend", default=default_backend, help="Express base URL")
    parser.add_argument("--ml", default=default_ml, help="FastAPI base URL")
    parser.add_argument("--frontend", default=default_frontend, help="Frontend URL")
    parser.add_argument("--state", default="Odisha", help="State used for trend verification")
    args = parser.parse_args()
    backend = args.backend.rstrip("/")
    ml = args.ml.rstrip("/")
    frontend = args.frontend
    BACKEND = backend
    ML = ml
    FRONTEND = frontend

    model_path = Path(__file__).resolve().parents[1] / "Backend" / "ml_service" / "model" / "flood-risk-baseline.json"
    try:
        with open(model_path, encoding="utf-8") as model_file:
            model = json.load(model_file)
        valid_features = {name: 1 for name in model["features"]}
    except (OSError, KeyError, json.JSONDecodeError):
        valid_features = None

    registration_body = {
        "name": "Local Smoke User",
        "email": f"smoke-{int(time.time())}@example.com",
        "phone": f"+919{int(time.time()) % 1000000000:09d}",
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
    registration_payload = json.loads(registration[2]) if registration[2] else {}
    verification_token = registration_payload.get("verificationToken")
    verification_headers = (
        {"Authorization": f"Bearer {verification_token}"}
        if verification_token
        else {}
    )

    dashboard_result = json_request(f"{BACKEND}/api/weather/dashboard")
    states_result = json_request(f"{BACKEND}/api/weather/states")
    trends_result = json_request(
        f"{BACKEND}/api/weather/trends?state={quote(args.state)}"
    )
    live_prediction_result = json_request(
        f"{BACKEND}/api/prediction",
        method="POST",
        payload={"latitude": 20.2961, "longitude": 85.8245},
    )
    show_live_result("weather dashboard", *dashboard_result)
    show_live_result("state matrix", *states_result)
    show_live_result("state trends", *trends_result)
    show_live_result("map prediction", *live_prediction_result)

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
            "registration is disabled or returns a phone-verification-only session",
            lambda: (
                registration[0] == 403
                and registration_payload.get("code") == "GOOGLE_SIGN_IN_REQUIRED"
            )
            or (
                registration[0] == 201
                and registration_payload.get("status") == "phone_verification_required"
                and bool(verification_token)
                and not registration_payload.get("token")
            ),
        ),
        check(
            "phone-verification tokens cannot access protected APIs",
            lambda: (
                bool(verification_token)
                and request(
                    f"{BACKEND}/api/auth/me", headers=verification_headers
                )[0]
                == 401
            )
            or (
                registration[0] == 403
                and registration_payload.get("code") == "GOOGLE_SIGN_IN_REQUIRED"
            ),
        ),
        check(
            "admin user list rejects missing authentication",
            lambda: request(f"{BACKEND}/api/admin/users")[0] == 401,
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
        check(
            "live dashboard returns monitored cities",
            lambda: dashboard_result[0] == 200 and bool(dashboard_result[1].get("cities")),
        ),
        check(
            "live state endpoint returns state matrix",
            lambda: states_result[0] == 200 and bool(states_result[1].get("states")),
        ),
        check(
            "live trend endpoint returns monthly data",
            lambda: trends_result[0] == 200 and bool(trends_result[1].get("months")),
        ),
        check(
            "live map prediction returns separated risk signals",
            lambda: live_prediction_result[0] == 200
            and "rain_outlook" in live_prediction_result[1]
            and "active_flood_risk" in live_prediction_result[1],
        ),
    ]
    passed = sum(results)
    print(f"\n{passed}/{len(results)} smoke checks passed")
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
