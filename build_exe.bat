@echo off
setlocal
cd /d "%~dp0"

echo [24-7 Carbon] Installing launcher build tools...
python -m pip install pyinstaller -q
if errorlevel 1 (
  echo Failed to install PyInstaller.
  exit /b 1
)

echo [24-7 Carbon] Building EXE...
python -m PyInstaller ^
  --noconfirm ^
  --clean ^
  --onefile ^
  --name "24-7-Carbon-Launcher" ^
  --add-data "backend;backend" ^
  --add-data "defaults;defaults" ^
  --add-data "frontend/public;frontend/public" ^
  --collect-submodules fastapi ^
  --collect-submodules pandas ^
  --collect-submodules numpy ^
  --collect-submodules pydantic ^
  --collect-submodules uvicorn ^
  packaging\launcher.py

if errorlevel 1 (
  echo Build failed.
  exit /b 1
)

echo.
echo Build complete: dist\24-7-Carbon-Launcher.exe
echo Share this .exe with users for one-click launch.
endlocal
