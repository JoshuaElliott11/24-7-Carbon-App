@echo off
setlocal
cd /d "%~dp0"

echo [24-7 Carbon] Checking Python...
python --version >nul 2>&1
if errorlevel 1 (
  echo Python not found on PATH. Install Python 3.11+ and try again.
  pause
  exit /b 1
)

echo [24-7 Carbon] Installing backend dependencies...
python -m pip install -r backend\requirements.txt
if errorlevel 1 (
  echo Dependency installation failed.
  pause
  exit /b 1
)

echo [24-7 Carbon] Opening browser at http://localhost:8000/ui
start "" "http://localhost:8000/ui"

echo [24-7 Carbon] Starting server... (Press Ctrl+C to stop)
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend

endlocal

