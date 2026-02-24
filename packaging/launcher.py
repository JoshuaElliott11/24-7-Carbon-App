from __future__ import annotations

import socket
import sys
import threading
import time
import webbrowser
from pathlib import Path

import fastapi  # noqa: F401
import numpy  # noqa: F401
import pandas  # noqa: F401
import pydantic  # noqa: F401
import uvicorn


def _base_path() -> Path:
    if getattr(sys, "frozen", False):
        return Path(getattr(sys, "_MEIPASS"))
    return Path(__file__).resolve().parents[1]


def _wait_and_open(url: str, host: str, port: int) -> None:
    for _ in range(60):
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(0.5)
        try:
            if sock.connect_ex((host, port)) == 0:
                webbrowser.open(url)
                return
        finally:
            sock.close()
        time.sleep(0.5)


def main() -> None:
    base = _base_path()
    backend_dir = base / "backend"
    if not backend_dir.exists():
        raise RuntimeError(f"Missing bundled backend directory: {backend_dir}")

    sys.path.insert(0, str(backend_dir))

    host = "127.0.0.1"
    port = 8000
    url = f"http://{host}:{port}/ui"

    thread = threading.Thread(target=_wait_and_open, args=(url, host, port), daemon=True)
    thread.start()

    uvicorn.run("app.main:app", host=host, port=port, app_dir=str(backend_dir), log_level="info")


if __name__ == "__main__":
    main()
