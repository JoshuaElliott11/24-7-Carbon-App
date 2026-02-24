Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location -Path $PSScriptRoot

Write-Host "[24-7 Carbon] Checking Python..."
try {
    python --version | Out-Null
} catch {
    Write-Host "Python not found on PATH. Install Python 3.11+ and try again." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host "[24-7 Carbon] Installing backend dependencies..."
python -m pip install -r backend\requirements.txt

Write-Host "[24-7 Carbon] Opening browser at http://localhost:8000/ui"
Start-Process "http://localhost:8000/ui"

Write-Host "[24-7 Carbon] Starting server... (Press Ctrl+C to stop)"
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend
