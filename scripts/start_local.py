"""Start the local GeoSentinel services and stop them together with Ctrl+C."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
import time
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
        [NPM, "run", "dev", "--", "--host", "127.0.0.1"],
    ),
]


def stream_output(name: str, process: subprocess.Popen[str]) -> None:
    assert process.stdout is not None
    for line in process.stdout:
        print(f"[{name}] {line}", end="", flush=True)


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
        for name, directory, command in SERVICES:
            print(f"Starting {name}: {' '.join(command)}")
            process = subprocess.Popen(
                command,
                cwd=directory,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                env=os.environ.copy(),
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0,
            )
            processes.append((name, process))

        print("\nLocal services started:")
        print("  Frontend: http://127.0.0.1:5173")
        print("  Backend:  http://127.0.0.1:5000/api/health")
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
