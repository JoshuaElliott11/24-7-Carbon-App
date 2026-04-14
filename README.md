# 24-7 Carbon Simulator

Web app + backend to model interval electricity load, supply, and emissions with:
- residual grid import (`what's left`)
- hourly matching vs legacy annual matching
- deliverability gating by distance
- multiple user-defined supply resources (each with constant or CSV energy/EF inputs)
- defaults/demo mode for zero-upload runs
- CSV and HTML export outputs

## Run Locally (non-Docker)
### One-click (Windows, easiest)
- Double-click `launch_24-7_carbon.bat`
- App opens automatically at `http://localhost:8000/ui`

Alternative PowerShell launcher:
- `powershell -ExecutionPolicy Bypass -File .\launch_24-7_carbon.ps1`

### Single EXE build (for sharing with non-technical users)
1. Run `build_exe.bat`
2. After build, share `dist\24-7-Carbon-Launcher.exe`
3. Recipient double-clicks the EXE, app opens automatically at `http://127.0.0.1:8000/ui`

### Build EXE on GitHub (recommended)
This repo includes a GitHub Actions workflow at `.github/workflows/release.yml` that builds and publishes the EXE on version tags.

Release flow:
1. Create a version tag: `git tag v1.0.0`
2. Push it: `git push origin v1.0.0`
3. Download `24-7-Carbon-Launcher.exe` from the GitHub Release assets

### Manual
1. Backend:
   - `cd backend`
   - `pip install -r requirements.txt`
   - `uvicorn app.main:app --reload --port 8000`
2. Frontend static UI:
   - `cd frontend/public`
   - `python -m http.server 3000`
3. Open `http://localhost:3000` or `http://localhost:8000/ui`

If sharing externally, see `docs/linkedin_user_guide.md`.

## Run with Docker
- `docker compose up --build`
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:8000/api/health`

## Host As Web App (recommended for sharing)
Use GitHub Pages for a shareable public URL.

Quick path:
1. Push repo to GitHub.
2. Enable Pages with source set to `GitHub Actions`.
3. Run the `Deploy GitHub Pages` workflow or push to `main`.
4. Share the published URL from the workflow summary.

Details: `docs/hosting.md`

## Demo Mode
Choose a labeled scenario in the `Demo Scenario` selector, then click `Run Demo`.

Included scenarios:
- Success: High-Integrity Portfolio
- Reasonable: Mixed Portfolio
- Poor: High-Carbon Outcome
- Legacy Trap: Annual Good, Hourly Weak (Temporal)
- Legacy Trap: Annual Good, Deliverability Weak (Spatial)

Each scenario includes recommended goal defaults so goal-achievement panels show desired vs achieved outcomes.

## CSV Templates
- Load: `timestamp,load_kwh`
- Resource energy: `timestamp,energy_kwh`
- EF timeseries: `timestamp,kgco2e_per_kwh`

Timestamps must be ISO-8601 with timezone offsets.

## Structure
- `backend/app`: API, compute engine, validation
- `backend/tests`: unit/API tests
- `defaults`: versioned defaults datasets
- `examples/profiles`: sample CSV profiles
- `docs`: spec, definitions, defaults notes
- `scripts/update_defaults.py`: deterministic demo default generator

## Notes
Defaults are illustrative and not compliance-grade by themselves.
Replace with jurisdictional factors, contractual instruments, and residual mix inputs for formal reporting.
