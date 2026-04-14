# Consultation Notes (Page-Referenced)

Source reviewed: `GHGP-Scope-2-Public-Consultation-Guidebook.pdf` in this repository.

## Key points used in the simulator

1. Hourly accounting direction
- The guidebook describes a shift from annual to hourly accounting for market-based claims, requiring same-hour matching of consumption and generation.
- References: pages 3, 51, 52, 57.

2. Locationality / local sourcing direction
- The guidebook describes narrowing spatial boundaries so claimed clean electricity is plausibly eligible for local claims (example references to bidding-zone style boundaries).
- References: pages 3, 20, 51, 57, 66.

3. Residual treatment for unmatched load
- The guidebook discusses moving away from broad average factors toward residual-mix-style treatment and fossil fallback where needed for unmatched consumption.
- References: pages 27, 29, 35, 54.

4. Feasibility mechanisms
- The guidebook describes exemptions, phased implementation, and use of load profiles/estimates where hourly data is unavailable.
- References: pages 3, 29, 35, 52, 61.

5. Legacy annual approach as comparator
- The guidebook contrasts current annual matching behavior vs hourly+locational updates.
- References: pages 52, 57, 60, 61.

## Implementation mapping in this repo
- Hourly interval engine: `backend/app/compute.py`
- Locationality gating: `backend/app/compute.py`
- Legacy vs hourly comparison metrics: `backend/app/compute.py`, `docs/definitions.md`
- Residual "what's left" grid import model: `backend/app/compute.py`
- Profile/feasibility handling via explicit fill strategies: `backend/app/validators.py`, `frontend/public/index.html`

## Caveat
This PDF is a consultation guidebook document, not the final GHG Protocol standard text. The app therefore labels defaults as illustrative and supports user-supplied factors and profiles.
