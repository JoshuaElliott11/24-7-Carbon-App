# 24-7 Carbon Simulator: Quick User Guide

## What this tool does
This app helps you test electricity-emissions outcomes using:
- your load profile
- one or more supply resources (solar, wind, etc.)
- automatic residual grid import ("what's left")
- hourly matching vs legacy annual matching comparison
- visual charts and downloadable results

It also includes a no-upload demo mode so anyone can try it instantly.

## Fastest way to start (Windows)
1. Download or clone the project folder.
2. Double-click `launch_24-7_carbon.bat`.
3. Your browser opens automatically at `http://localhost:8000/ui`.
4. Click `Run Demo (No Uploads)` for an instant example.

If `.bat` is blocked in your environment, run PowerShell script instead:
- Right-click `launch_24-7_carbon.ps1` and run with PowerShell
- Or run in terminal: `powershell -ExecutionPolicy Bypass -File .\launch_24-7_carbon.ps1`

## Easiest way to share to non-technical users (single file)
1. On your machine, run `build_exe.bat`.
2. Send `dist\24-7-Carbon-Launcher.exe` to users.
3. They double-click the EXE and the app opens automatically.

## Demo mode (no data needed)
1. Open the app.
2. Click `Run Demo (No Uploads)`.
3. Review:
- summary metrics
- interval emissions and grid-import chart
- legacy annual vs hourly matching chart
4. Export:
- `results_summary.csv`
- `interval_results.csv`
- `report.html`

## Bring your own data
Use these CSV headers exactly:

Load:
```csv
timestamp,load_kwh
2026-01-01T00:00:00+00:00,320
```

Resource energy:
```csv
timestamp,energy_kwh
2026-01-01T00:00:00+00:00,120
```

Resource/grid emissions factor:
```csv
timestamp,kgco2e_per_kwh
2026-01-01T00:00:00+00:00,0.18
```

## Manual run steps
1. Paste or upload `Load CSV`.
2. Add one or more resources using `Add Resource`.
3. For each resource, provide either:
- a constant energy / emissions factor, or
- CSV time series inputs.
4. Set project options:
- site latitude/longitude
- deliverability threshold (km)
- emissions mode (`operational` or `lifecycle`)
- missing-interval strategy
5. Set grid emissions (constant or CSV).
6. Click `Run Manual Simulation`.

## Important formatting rules
- Timestamps must be ISO-8601 with timezone (for example `+00:00`).
- No duplicate timestamps.
- Keep all series at a consistent interval (hourly recommended).

## What to share with others
When sharing publicly, include:
- a screenshot of demo charts
- the launch instruction: "Double-click `launch_24-7_carbon.bat`"
- a note that defaults are illustrative and should be replaced with project-specific data for reporting.
