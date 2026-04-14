"""Refresh defaults datasets with multiple labeled demo scenarios."""

from __future__ import annotations

import json
import math
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "defaults" / "demo_profiles.json"
OUT_WEB = ROOT / "frontend" / "public" / "defaults" / "demo_profiles.json"


def _base_load(hours: int, seed: int) -> list[dict]:
    random.seed(seed)
    start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    rows = []
    for i in range(hours):
        t = start + timedelta(hours=i)
        hod = t.hour
        weekday = t.weekday()
        office = 520 if weekday < 5 and 8 <= hod <= 18 else 240
        rows.append({"timestamp": t.isoformat(), "load_kwh": round(office + random.uniform(-18, 18), 2)})
    return rows


def _profile_from_load(load: list[dict], fn) -> list[dict]:
    out = []
    for row in load:
        t = datetime.fromisoformat(row["timestamp"])
        out.append({"timestamp": row["timestamp"], "value": round(max(0.0, fn(t, row["load_kwh"])), 2)})
    return out


def _resource(
    name: str,
    energy_series: list[dict],
    default_technology: str | None,
    is_renewable: bool,
    locationality_preset: str,
    lat: float,
    lon: float,
    ef_mode: str = "default_technology",
    constant_ef: float | None = None,
) -> dict:
    payload = {
        "name": name,
        "is_renewable": is_renewable,
        "energy_unit": "kwh",
        "emissions_unit": "kgco2e_per_kwh",
        "ef_input_mode": ef_mode,
        "default_technology": default_technology,
        "locationality_preset": locationality_preset,
        "latitude": lat,
        "longitude": lon,
        "energy_series": energy_series,
        "ef_series": [],
    }
    if constant_ef is not None:
        payload["constant_ef"] = constant_ef
    return payload


def _scenario(
    scenario_id: str,
    label: str,
    description: str,
    load: list[dict],
    resources: list[dict],
    grid_country: str,
    goal_defaults: dict,
) -> dict:
    return {
        "id": scenario_id,
        "label": label,
        "description": description,
        "load_profile": load,
        "resources": resources,
        "grid": {
            "emissions_unit": "kgco2e_per_kwh",
            "ef_input_mode": "country_default",
            "country_code": grid_country,
            "ef_series": [],
        },
        "goal_defaults": goal_defaults,
    }


def build_demo(hours: int = 24 * 28, seed: int = 42) -> dict:
    load = _base_load(hours, seed)
    rng = random.Random(seed + 99)

    solar = _profile_from_load(
        load,
        lambda t, _: math.sin(((t.hour - 7) / 10) * math.pi) * 390 if 7 <= t.hour <= 17 else 0.0,
    )
    wind_near = _profile_from_load(load, lambda _t, _l: 180 + rng.uniform(-60, 130))
    wind_far = _profile_from_load(load, lambda _t, _l: 190 + rng.uniform(-90, 170))
    gas_peaker = _profile_from_load(
        load,
        lambda t, _l: (95 if t.hour in {17, 18, 19, 20} else (35 if t.hour in {7, 8} else 8)) + rng.uniform(-6, 6),
    )

    # Scenario 1: strong performance
    s1_resources = [
        _resource("solar_near", solar, "solar_pv_utility", True, "same_zone", 51.52, -0.12),
        _resource("wind_near", wind_near, "wind_onshore", True, "same_zone", 51.58, -0.21),
        _resource("wind_adjacent", wind_far, "wind_onshore", True, "adjacent_zone", 52.9, 0.6),
        _resource("gas_peaker", gas_peaker, None, False, "unconnected", 51.49, -0.08, ef_mode="constant", constant_ef=0.37),
    ]

    # Scenario 2: reasonable/mid performance
    s2_resources = [
        _resource(
            "solar_near",
            _profile_from_load(load, lambda t, _l: (math.sin(((t.hour - 7) / 10) * math.pi) * 260 if 7 <= t.hour <= 17 else 0.0)),
            "solar_pv_utility",
            True,
            "same_zone",
            51.52,
            -0.12,
        ),
        _resource("wind_near", _profile_from_load(load, lambda _t, _l: 120 + rng.uniform(-50, 80)), "wind_onshore", True, "adjacent_zone", 51.58, -0.21),
        _resource("gas_mid", _profile_from_load(load, lambda t, _l: 85 if 16 <= t.hour <= 21 else 25), None, False, "same_zone", 51.45, -0.05, ef_mode="constant", constant_ef=0.37),
    ]

    # Scenario 3: poor/high-emissions
    s3_resources = [
        _resource("small_solar", _profile_from_load(load, lambda t, _l: (math.sin(((t.hour - 7) / 10) * math.pi) * 120 if 7 <= t.hour <= 17 else 0.0)), "solar_pv_utility", True, "same_zone", 51.52, -0.12),
        _resource("coal_baseload", _profile_from_load(load, lambda _t, _l: 70 + rng.uniform(-15, 25)), None, False, "unconnected", 51.43, -0.04, ef_mode="constant", constant_ef=0.8),
    ]

    # Scenario 4: legacy annual looks strong, hourly weak (temporal mismatch)
    s4_resources = [
        _resource("solar_oversized_midday", _profile_from_load(load, lambda t, _l: (math.sin(((t.hour - 7) / 10) * math.pi) * 820 if 7 <= t.hour <= 17 else 0.0)), "solar_pv_utility", True, "same_zone", 51.52, -0.12),
    ]

    # Scenario 5: legacy annual looks strong, locationality weak (spatial mismatch)
    s5_resources = [
        _resource("wind_far_large", _profile_from_load(load, lambda _t, _l: 260 + rng.uniform(-40, 150)), "wind_onshore", True, "unconnected", 53.4, 1.2),
    ]

    scenarios = [
        _scenario(
            "success_high_integrity",
            "Success: High-Integrity Portfolio",
            "Strong same-zone renewables with explicit adjacent-zone support. The adjacent-zone wind is eligible in hourly matching, while the unconnected gas backup stays excluded from market-based claims.",
            load,
            s1_resources,
            "GB",
            {
                "interval_renewable_target_percent": 70,
                "interval_emissions_target_g_per_kwh": 120,
                "daily_renewable_target_percent": 65,
                "daily_emissions_target_g_per_kwh": 130,
                "weekly_renewable_target_percent": 68,
                "weekly_emissions_target_g_per_kwh": 125,
                "monthly_renewable_target_percent": 70,
                "monthly_emissions_target_g_per_kwh": 120,
            },
        ),
        _scenario(
            "reasonable_mixed_portfolio",
            "Reasonable: Mixed Portfolio",
            "Balanced case with moderate renewables, including adjacent-zone wind that still counts for hourly matching. This shows how adjacent-zone support can lift the eligible view without treating it like a universal premium.",
            load,
            s2_resources,
            "GB",
            {
                "interval_renewable_target_percent": 55,
                "interval_emissions_target_g_per_kwh": 220,
                "daily_renewable_target_percent": 52,
                "daily_emissions_target_g_per_kwh": 230,
                "weekly_renewable_target_percent": 54,
                "weekly_emissions_target_g_per_kwh": 225,
                "monthly_renewable_target_percent": 55,
                "monthly_emissions_target_g_per_kwh": 220,
            },
        ),
        _scenario(
            "bad_high_carbon",
            "Poor: High-Carbon Outcome",
            "Low renewables and high-carbon supply produce weak goal achievement, regardless of locationality.",
            load,
            s3_resources,
            "GB",
            {
                "interval_renewable_target_percent": 50,
                "interval_emissions_target_g_per_kwh": 300,
                "daily_renewable_target_percent": 45,
                "daily_emissions_target_g_per_kwh": 320,
                "weekly_renewable_target_percent": 48,
                "weekly_emissions_target_g_per_kwh": 310,
                "monthly_renewable_target_percent": 50,
                "monthly_emissions_target_g_per_kwh": 300,
            },
        ),
        _scenario(
            "legacy_temporal_gap",
            "Legacy Trap: Annual Good, Hourly Weak (Temporal)",
            "Oversized midday solar makes annual matching look perfect, but hourly coverage drops sharply outside solar hours.",
            load,
            s4_resources,
            "GB",
            {
                "interval_renewable_target_percent": 60,
                "interval_emissions_target_g_per_kwh": 180,
                "daily_renewable_target_percent": 55,
                "daily_emissions_target_g_per_kwh": 190,
                "weekly_renewable_target_percent": 58,
                "weekly_emissions_target_g_per_kwh": 185,
                "monthly_renewable_target_percent": 60,
                "monthly_emissions_target_g_per_kwh": 180,
            },
        ),
        _scenario(
            "legacy_spatial_gap",
            "Locationality Trap: Unconnected Supply Excluded",
            "Far-away wind is excluded from the eligible view, so both annual and hourly matching collapse when the portfolio lacks local supply.",
            load,
            s5_resources,
            "GB",
            {
                "interval_renewable_target_percent": 60,
                "interval_emissions_target_g_per_kwh": 180,
                "daily_renewable_target_percent": 55,
                "daily_emissions_target_g_per_kwh": 190,
                "weekly_renewable_target_percent": 58,
                "weekly_emissions_target_g_per_kwh": 185,
                "monthly_renewable_target_percent": 60,
                "monthly_emissions_target_g_per_kwh": 180,
            },
        ),
    ]

    default = scenarios[0]
    return {
        "metadata": {
            "version": "2026.03",
            "timezone": "UTC",
            "note": "Synthetic multi-scenario demo profiles for zero-upload simulation.",
        },
        "default_scenario": default["id"],
        "scenarios": scenarios,
        # Backward compatibility fields
        "load_profile": default["load_profile"],
        "resources": default["resources"],
        "grid": default["grid"],
    }


def main() -> None:
    payload = json.dumps(build_demo(), indent=2)
    OUT.write_text(payload, encoding="utf-8")
    OUT_WEB.parent.mkdir(parents=True, exist_ok=True)
    OUT_WEB.write_text(payload, encoding="utf-8")
    print(f"Wrote {OUT}")
    print(f"Wrote {OUT_WEB}")


if __name__ == "__main__":
    main()
