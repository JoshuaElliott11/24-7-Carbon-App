# Hosting on GitHub Pages

This project now supports static hosting on GitHub Pages with client-side simulation fallback.

## What gets deployed
- `frontend/public/index.html`
- `frontend/public/app.js`
- `frontend/public/local-sim.js`
- Required defaults JSON files from `defaults/`

## Enable Pages
1. Push this repository to GitHub.
2. In repository settings, open `Pages`.
3. Set source to `GitHub Actions`.
4. Push to `main` (or run the workflow manually).
5. Open the published URL shown by the `Deploy GitHub Pages` workflow.

## Notes
- On Pages, the app uses local JSON defaults and runs simulation in-browser when API endpoints are unavailable.
- If you run backend locally, the same frontend can still call `/api/*` for server execution.
