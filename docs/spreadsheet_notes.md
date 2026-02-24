# Spreadsheet Notes

File reviewed: `GHGP Scope 2 Public Consultation Survey Guidebook Table.xlsx`

## What it contains
- Two sheets:
  - `Full Survey Walkthrough (Recomm...)`
  - `Quick Response Answer Guide (on...)`
- Content is a consultation-response guide (question IDs, topics, suggested answers/notes).

## What it does not contain
- No load-demand timeseries schema.
- No generation profile schema.
- No emissions-factor timeseries schema.

## Project impact
- Treated as policy-context input only (used to validate direction of hourly matching, deliverability, and residual/fallback logic).
- Not used as a simulation data template source.

## Data templates used by this app
- Load: `timestamp,load_kwh`
- Resource profile: `timestamp,energy_kwh`
- EF timeseries: `timestamp,kgco2e_per_kwh`

These are implemented and validated in `backend/app/validators.py` and surfaced in the UI (`frontend/public/index.html`).
