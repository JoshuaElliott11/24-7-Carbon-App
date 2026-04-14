# Metric Definitions

- `total_emissions_kgco2e`: sum of interval total emissions.
- `emissions_intensity_kgco2e_per_kwh`: `total_emissions_kgco2e / total_load_kwh`.
- `hourly_matched_energy_kwh`: for each interval, `min(load, eligible_supply)` and summed.
- `hourly_matching_percent`: `hourly_matched_energy_kwh / total_load_kwh`.
- `legacy_annual_matching_percent`: `min(1, annual_portfolio_renewable_supply / annual_load)`.
- `unmatched_energy_kwh`: `total_load_kwh - hourly_matched_energy_kwh`.
- `daily_average_emissions_composition`: daily resource emissions shares as percentages.
- `monthly_rollup` and `annual_rollup`: load, grid import, emissions, and intensity aggregates.

## Eligibility
A resource is eligible for market-based hourly matching when its locationality preset allows it to be included in the eligible view.

Locationality presets are interpreted as:
- `same_zone`: eligible for hourly matching in eligible view.
- `adjacent_zone`: eligible for hourly matching in eligible view.
- `unconnected`: excluded from hourly matching in eligible view.

Legacy annual matching remains a full-portfolio annual netting baseline and is not reduced by eligible-view locationality filtering.

Adjacent-zone cost treatment, if used, is controlled by a project-level multiplier rather than a universal fixed haircut or premium.

## Units
- Energy: kWh (internal)
- Emissions factor: kgCO2e/kWh (internal)
- Emissions: kgCO2e
