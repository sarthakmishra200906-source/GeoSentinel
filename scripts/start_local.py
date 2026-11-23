"""Start the local GeoSentinel services and stop them together with Ctrl+C."""

from __future__ import annotations

import json
import os
import socket
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NPM = "npm.cmd" if os.name == "nt" else "npm"
SERVICES = [
    ("backend", ROOT / "Backend" / "server", [NPM, "start"]),
    (
        "ml",
        ROOT / "Backend" / "ml_service",
        [sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", "8000"],
    ),
    (
        "frontend",
        ROOT / "Frontend" / "Resq-AI",
        [NPM, "run", "dev", "--", "--host", "localhost"],
    ),
]
HEALTH_URLS = {
    "ml": "http://127.0.0.1:8000/health",
}


def stream_output(name: str, process: subprocess.Popen[str]) -> None:
    assert process.stdout is not None
    for line in process.stdout:
        print(f"[{name}] {line}", end="", flush=True)


def service_is_healthy(url: str) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


def backend_status(url: str) -> str:
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            data = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError:
        return "incompatible"
    except (OSError, urllib.error.URLError, json.JSONDecodeError):
        return "offline"

    capabilities = data.get("capabilities", {})
    if data.get("service") == "geosentinel-api" and capabilities.get("guestChat") is True:
        return "healthy"
    return "incompatible"


def frontend_status(url: str, api_url: str) -> str:
    try:
        with urllib.request.urlopen(url, timeout=2) as response:
            page = response.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError:
        return "incompatible"
    except (OSError, urllib.error.URLError):
        return "offline"
    expected_api_marker = f'<meta name="geosentinel-api" content="{api_url}"'
    return (
        "healthy"
        if "<title>Resq-AI</title>" in page and 'id="root"' in page and expected_api_marker in page
        else "incompatible"
    )


def is_port_available(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        try:
            listener.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def try_free_port(port: int) -> bool:
    """If port is occupied by a stale process, attempt to terminate it cleanly."""
    if is_port_available(port):
        return True
    if os.name == "nt":
        try:
            output = subprocess.check_output(f'netstat -ano -p tcp | findstr /R /C:":{port} "', shell=True, text=True)
            for line in output.splitlines():
                parts = line.strip().split()
                if len(parts) >= 5 and f":{port}" in parts[1] and parts[3] == "LISTENING":
                    pid = int(parts[4])
                    if pid > 4:
                        print(f"Detected stale process PID {pid} on port {port}. Terminating it...")
                        subprocess.run(["taskkill", "/F", "/PID", str(pid)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                        time.sleep(1)
                        if is_port_available(port):
                            print(f"Successfully freed port {port} for GeoSentinel.")
                            return True
        except Exception:
            pass
    return is_port_available(port)


def sync_frontend_env(api_url: str) -> None:
    """Ensure Frontend/Resq-AI/.env.local has the exact matching VITE_API_URL."""
    env_local = ROOT / "Frontend" / "Resq-AI" / ".env.local"
    lines = []
    updated = False
    if env_local.exists():
        for line in env_local.read_text(encoding="utf-8").splitlines():
            if line.startswith("VITE_API_URL="):
                lines.append(f"VITE_API_URL={api_url}")
                updated = True
            else:
                lines.append(line)
    if not updated:
        lines.insert(0, f"VITE_API_URL={api_url}")
    env_local.write_text("\n".join(lines) + "\n", encoding="utf-8")


def find_free_port(preferred_port: int) -> int:
    for port in range(preferred_port + 1, min(preferred_port + 21, 65536)):
        if is_port_available(port):
            return port
    raise RuntimeError(f"No free backend port found near {preferred_port}")


def configured_backend_port() -> int:
    configured_port = os.environ.get("PORT")
    if not configured_port:
        env_file = ROOT / "Backend" / "server" / ".env"
        if env_file.exists():
            for line in env_file.read_text(encoding="utf-8").splitlines():
                if line.strip().startswith("PORT="):
                    configured_port = line.split("=", 1)[1].strip().strip("\"'")
                    break
    try:
        port = int(configured_port or "5000")
    except ValueError as error:
        raise RuntimeError("Backend PORT must be an integer between 1 and 65535") from error
    if not 1 <= port <= 65535:
        raise RuntimeError("Backend PORT must be an integer between 1 and 65535")
    return port


def stop_processes(processes: list[tuple[str, subprocess.Popen[str]]]) -> None:
    for name, process in reversed(processes):
        if process.poll() is None:
            print(f"\nStopping {name}...")
            if os.name == "nt":
                process.send_signal(signal.CTRL_BREAK_EVENT)
            else:
                process.terminate()
    deadline = time.monotonic() + 10
    for _, process in processes:
        remaining = max(0, deadline - time.monotonic())
        try:
            process.wait(timeout=remaining)
        except subprocess.TimeoutExpired:
            process.kill()


def main() -> int:
    processes: list[tuple[str, subprocess.Popen[str]]] = []
    try:
        backend_port = configured_backend_port()
        backend_health_url = f"http://127.0.0.1:{backend_port}/api/health"
        status = backend_status(backend_health_url)
        if status == "healthy":
            print(f"Reusing healthy GeoSentinel backend at {backend_health_url}")
            backend_is_running = True
        else:
            backend_is_running = False
            if not try_free_port(backend_port):
                alternate_port = find_free_port(backend_port)
                print(
                    f"Backend port {backend_port} is occupied by another or outdated service; "
                    f"using port {alternate_port} for GeoSentinel."
                )
                backend_port = alternate_port

        frontend_port = 5173
        frontend_health_url = f"http://localhost:{frontend_port}/GeoSentinel/"
        frontend_api_url = f"http://localhost:{backend_port}/api"
        sync_frontend_env(frontend_api_url)

        if frontend_status(frontend_health_url, frontend_api_url) == "healthy":
            frontend_is_running = True
        else:
            frontend_is_running = False
            if not try_free_port(frontend_port):
                alternate_port = find_free_port(frontend_port)
                print(
                    f"Frontend port {frontend_port} is occupied by another or outdated service; "
                    f"using port {alternate_port} for GeoSentinel."
                )
                frontend_port = alternate_port

        for name, directory, command in SERVICES:
            if name == "backend":
                if backend_is_running:
                    continue
                print(f"Starting {name}: {' '.join(command)}")
                service_environment = os.environ.copy()
                service_environment["PORT"] = str(backend_port)
                process = subprocess.Popen(
                    command,
                    cwd=directory,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    env=service_environment,
                    creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
                )
                processes.append((name, process))
                continue

            if name == "frontend":
                if frontend_is_running:
                    continue
                command = [NPM, "run", "dev", "--", "--host", "localhost", "--port", str(frontend_port)]

            if name != "frontend" and service_is_healthy(HEALTH_URLS[name]):
                print(f"Reusing healthy {name} service already running at {HEALTH_URLS[name]}")
                continue
            print(f"Starting {name}: {' '.join(command)}")
            process = subprocess.Popen(
                command,
                cwd=directory,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                env={
                    **os.environ.copy(),
                    **(
                        {"VITE_API_URL": frontend_api_url}
                        if name == "frontend"
                        else {}
                    ),
                },
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
            )
            processes.append((name, process))

        print("\nLocal services started:")
        print(f"  Frontend: http://localhost:{frontend_port}/GeoSentinel/")
        print(f"  Backend:  http://127.0.0.1:{backend_port}/api/health")
        print("  ML:       http://127.0.0.1:8000/health")
        print("Press Ctrl+C to stop all services.\n")

        import threading

        for name, process in processes:
            threading.Thread(target=stream_output, args=(name, process), daemon=True).start()

        while True:
            failed = [(name, process.returncode) for name, process in processes if process.poll() is not None]
            if failed:
                print(f"A service exited unexpectedly: {failed}", file=sys.stderr)
                return 1
            time.sleep(1)
    except KeyboardInterrupt:
        return 0
    finally:
        stop_processes(processes)


if __name__ == "__main__":
    raise SystemExit(main())
