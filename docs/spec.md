# 24-7 Carbon Simulator Spec

## Goal
Simulate interval-based electricity emissions accounting with hourly matching, grid residual import, and legacy-vs-hourly comparisons.

## Required Inputs
- `load_profile`: interval demand series (`timestamp`, `load_kwh`)
- `resources[]`: non-grid supply resources with energy profile and emissions factors
- `grid`: final residual resource with emissions factor series or constant
- `project`: deliverability and method controls

## Core Rules
- Grid import is always residual: `grid_import = max(0, load - sum(non_grid_supply))`
- Spill/export is tracked as `spill = max(0, sum(non_grid_supply) - load)`
- Emissions are interval-based and aggregated to monthly/annual/lifetime
- Hourly matching is computed with per-interval eligible clean supply
- Legacy annual matching is computed from annual eligible supply netting
- Deliverability gate excludes remote resources from matching metrics

## Validation
- ISO-8601 timestamps with timezone required
- Duplicate timestamps forbidden
- Missing intervals use explicit strategy: reject / forward fill / interpolate / zero fill
- Internal units normalized to kWh and kgCO2e/kWh

## Outputs
- Summary metrics
- Interval results
- Daily emissions composition
- Monthly and annual rollups
- HTML report and CSV exports
