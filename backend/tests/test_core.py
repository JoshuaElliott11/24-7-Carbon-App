from __future__ import annotations

import pandas as pd

from app.compute import ResourceSeries, haversine_km, simulate
from app.models import EmissionsMode, ProjectConfig
from app.validators import convert_ef_to_kg_per_kwh, convert_energy_to_kwh


def test_unit_conversion_energy():
    assert convert_energy_to_kwh(1, "kwh") == 1
    assert convert_energy_to_kwh(1, "mwh") == 1000
    assert convert_energy_to_kwh(1, "gwh") == 1_000_000


def test_unit_conversion_ef():
    assert convert_ef_to_kg_per_kwh(1000, "gco2e_per_kwh") == 1
    assert convert_ef_to_kg_per_kwh(1, "kgco2e_per_kwh") == 1
    assert convert_ef_to_kg_per_kwh(1, "tco2e_per_mwh") == 1


def test_haversine_positive_distance():
    d = haversine_km(51.5074, -0.1278, 52.52, 13.405)
    assert d > 900


def test_grid_whats_left_and_energy_balance():
    idx = pd.date_range("2026-01-01", periods=4, freq="h", tz="UTC")
    load = pd.Series([10.0, 10.0, 10.0, 10.0], index=idx)
    solar = pd.Series([6.0, 12.0, 2.0, 0.0], index=idx)
    ef = pd.Series([0.0, 0.0, 0.0, 0.0], index=idx)
    grid_ef = pd.Series([0.5, 0.5, 0.5, 0.5], index=idx)

    out = simulate(
        load_kwh=load,
        resources=[ResourceSeries(name="solar", energy_kwh=solar, ef_kg_per_kwh=ef, is_renewable=True)],
        grid_ef_kg_per_kwh=grid_ef,
        project=ProjectConfig(site_latitude=51.5, site_longitude=-0.1, deliverability_km=20),
        emissions_mode=EmissionsMode.operational,
        logs=[],
    )

    assert out.physical.summary["total_load_kwh"] == 40.0
    assert abs(out.physical.summary["grid_served_kwh"] - 22.0) < 1e-9
    assert abs(out.physical.summary["total_emissions_kgco2e"] - 11.0) < 1e-9
    assert abs(out.physical.summary["energy_balance_error_kwh"]) < 1e-9


def test_deliverability_gating_affects_hourly_matching():
    idx = pd.date_range("2026-01-01", periods=2, freq="h", tz="UTC")
    load = pd.Series([10.0, 10.0], index=idx)
    wind = pd.Series([10.0, 10.0], index=idx)
    ef = pd.Series([0.0, 0.0], index=idx)
    grid_ef = pd.Series([0.2, 0.2], index=idx)

    out = simulate(
        load_kwh=load,
        resources=[
            ResourceSeries(
                name="far_wind",
                energy_kwh=wind,
                ef_kg_per_kwh=ef,
                is_renewable=True,
                latitude=55.0,
                longitude=10.0,
            )
        ],
        grid_ef_kg_per_kwh=grid_ef,
        project=ProjectConfig(site_latitude=51.5, site_longitude=-0.1, deliverability_km=20),
        emissions_mode=EmissionsMode.operational,
        logs=[],
    )

    assert out.eligible.summary["hourly_matching_percent"] == 0.0
    # Legacy annual matching ignores deliverability constraints in this simulator.
    assert out.physical.summary["legacy_annual_matching_percent"] == 1.0


def test_legacy_vs_hourly_difference_fixture():
    idx = pd.date_range("2026-01-01", periods=4, freq="h", tz="UTC")
    load = pd.Series([10.0, 10.0, 10.0, 10.0], index=idx)
    solar = pd.Series([20.0, 20.0, 0.0, 0.0], index=idx)
    ef = pd.Series([0.0, 0.0, 0.0, 0.0], index=idx)
    grid_ef = pd.Series([0.3, 0.3, 0.3, 0.3], index=idx)

    out = simulate(
        load_kwh=load,
        resources=[ResourceSeries(name="solar", energy_kwh=solar, ef_kg_per_kwh=ef, is_renewable=True)],
        grid_ef_kg_per_kwh=grid_ef,
        project=ProjectConfig(),
        emissions_mode=EmissionsMode.operational,
        logs=[],
    )

    assert out.physical.summary["legacy_annual_matching_percent"] == 1.0
    assert out.physical.summary["hourly_matching_percent"] == 0.5
