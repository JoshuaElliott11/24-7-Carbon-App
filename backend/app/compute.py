from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import pandas as pd

from .models import EmissionsMode, ProjectConfig
from .validators import sum_series


@dataclass
class ResourceSeries:
    name: str
    energy_kwh: pd.Series
    ef_kg_per_kwh: pd.Series
    is_renewable: bool
    locationality_preset: str = "same_zone"
    latitude: Optional[float] = None
    longitude: Optional[float] = None


@dataclass
class ViewOutput:
    summary: dict
    interval: pd.DataFrame
    daily_rollup: pd.DataFrame
    weekly_rollup: pd.DataFrame
    monthly_rollup: pd.DataFrame
    annual_rollup: pd.DataFrame
    by_hour: pd.DataFrame
    by_weekday: pd.DataFrame
    heatmap: pd.DataFrame
    weekly_composition: pd.DataFrame
    goal_achievement: dict


@dataclass
class SimulationOutput:
    physical: ViewOutput
    eligible: ViewOutput
    logs: list[str]

def _rollup(interval: pd.DataFrame, freq: str) -> pd.DataFrame:
    grouped = interval.resample(freq).agg(
        load_kwh=("load_kwh", "sum"),
        renewable_served_kwh=("renewable_served_kwh", "sum"),
        grid_import_kwh=("grid_import_kwh", "sum"),
        total_emissions_kgco2e=("total_emissions_kgco2e", "sum"),
    )
    grouped["renewable_percent"] = 100.0 * grouped["renewable_served_kwh"] / grouped["load_kwh"].replace(0, 1e-12)
    grouped["emissions_intensity_g_per_kwh"] = (
        1000.0 * grouped["total_emissions_kgco2e"] / grouped["load_kwh"].replace(0, 1e-12)
    )
    return grouped


def _goal_achievement(rollup: pd.DataFrame, ren_target: Optional[float], emissions_target: Optional[float]) -> dict:
    avg_ren = float(rollup["renewable_percent"].mean()) if len(rollup) else None
    avg_em = float(rollup["emissions_intensity_g_per_kwh"].mean()) if len(rollup) else None
    if ren_target is None and emissions_target is None:
        return {
            "configured": False,
            "renewable_target_percent": None,
            "emissions_target_g_per_kwh": None,
            "achieved_average_renewable_percent": avg_ren,
            "achieved_average_emissions_g_per_kwh": avg_em,
            "achievement_percent": None,
            "total_periods": len(rollup),
            "passed_periods": None,
            "renewable_only_pass_percent": None,
            "emissions_only_pass_percent": None,
        }

    total = int(len(rollup))
    ren_pass = pd.Series(True, index=rollup.index)
    em_pass = pd.Series(True, index=rollup.index)
    if ren_target is not None:
        ren_pass = rollup["renewable_percent"] >= ren_target
    if emissions_target is not None:
        em_pass = rollup["emissions_intensity_g_per_kwh"] <= emissions_target
    both = ren_pass & em_pass

    return {
        "configured": True,
        "renewable_target_percent": ren_target,
        "emissions_target_g_per_kwh": emissions_target,
        "achieved_average_renewable_percent": avg_ren,
        "achieved_average_emissions_g_per_kwh": avg_em,
        "achievement_percent": float(100.0 * both.sum() / total) if total > 0 else 0.0,
        "total_periods": total,
        "passed_periods": int(both.sum()),
        "renewable_only_pass_percent": float(100.0 * ren_pass.sum() / total) if total > 0 else 0.0,
        "emissions_only_pass_percent": float(100.0 * em_pass.sum() / total) if total > 0 else 0.0,
    }


def _allocate_interval(
    load_kwh: pd.Series,
    resources: list[ResourceSeries],
    residual_ef_kg_per_kwh: pd.Series,
    sss_share_percent: float,
    sss_ef_kg_per_kwh: pd.Series,
) -> pd.DataFrame:
    idx = load_kwh.index
    interval = pd.DataFrame(index=idx)
    interval["load_kwh"] = load_kwh
    interval["residual_ef_kg_per_kwh"] = residual_ef_kg_per_kwh
    interval["sss_ef_kg_per_kwh"] = sss_ef_kg_per_kwh

    sss_share = float(max(0.0, min(1.0, sss_share_percent / 100.0)))
    interval["sss_served_kwh"] = interval["load_kwh"] * sss_share
    interval["sss_emissions_kg"] = interval["sss_served_kwh"] * interval["sss_ef_kg_per_kwh"]

    interval["resource_generation_kwh"] = (
        sum_series([r.energy_kwh for r in resources], idx) if resources else pd.Series(0.0, index=idx)
    )

    remaining = (load_kwh - interval["sss_served_kwh"]).clip(lower=0.0)
    renewable_served = pd.Series(0.0, index=idx)
    for r in resources:
        served = pd.concat([r.energy_kwh, remaining], axis=1).min(axis=1).clip(lower=0.0)
        spilled = (r.energy_kwh - served).clip(lower=0.0)
        emissions = served * r.ef_kg_per_kwh
        remaining = (remaining - served).clip(lower=0.0)

        interval[f"{r.name}_generation_kwh"] = r.energy_kwh
        interval[f"{r.name}_served_kwh"] = served
        interval[f"{r.name}_spilled_kwh"] = spilled
        interval[f"{r.name}_ef_kg_per_kwh"] = r.ef_kg_per_kwh
        interval[f"{r.name}_emissions_kg"] = emissions

        if r.is_renewable:
            renewable_served = renewable_served.add(served, fill_value=0.0)

    interval["grid_import_kwh"] = remaining
    interval["grid_emissions_kg"] = interval["grid_import_kwh"] * interval["residual_ef_kg_per_kwh"]
    interval["renewable_served_kwh"] = renewable_served
    resource_served_cols = [c for c in interval.columns if c.endswith("_served_kwh") and c != "sss_served_kwh"]
    resource_served_total = (
        interval[resource_served_cols].sum(axis=1) if resource_served_cols else pd.Series(0.0, index=idx)
    )
    interval["spilled_total_kwh"] = (interval["resource_generation_kwh"] - resource_served_total).clip(lower=0.0)

    resource_emission_cols = [
        c
        for c in interval.columns
        if c.endswith("_emissions_kg") and c not in {"grid_emissions_kg", "sss_emissions_kg"}
    ]
    interval["total_emissions_kgco2e"] = (
        interval[resource_emission_cols].sum(axis=1) + interval["grid_emissions_kg"] + interval["sss_emissions_kg"]
    )
    interval["renewable_percent"] = 100.0 * interval["renewable_served_kwh"] / interval["load_kwh"].replace(0, 1e-12)
    interval["emissions_intensity_g_per_kwh"] = (
        1000.0 * interval["total_emissions_kgco2e"] / interval["load_kwh"].replace(0, 1e-12)
    )
    return interval


def _view_from_interval(
    interval: pd.DataFrame,
    resources_for_matching: list[ResourceSeries],
    legacy_resources_for_annual: list[ResourceSeries],
    all_load: pd.Series,
    project: ProjectConfig,
    emissions_mode: EmissionsMode,
) -> ViewOutput:
    idx = interval.index
    total_load = float(interval["load_kwh"].sum())
    total_emissions = float(interval["total_emissions_kgco2e"].sum())

    renewable_generation = (
        sum_series([r.energy_kwh for r in resources_for_matching if r.is_renewable], idx)
        if resources_for_matching
        else pd.Series(0.0, index=idx)
    )
    legacy_renewable_generation = (
        sum_series([r.energy_kwh for r in legacy_resources_for_annual if r.is_renewable], idx)
        if legacy_resources_for_annual
        else pd.Series(0.0, index=idx)
    )
    voluntary_load = (all_load - interval["sss_served_kwh"]).clip(lower=0.0)
    hourly_matched = pd.concat([renewable_generation, voluntary_load], axis=1).min(axis=1).clip(lower=0.0)
    unmatched = (voluntary_load - hourly_matched).clip(lower=0.0)
    legacy_annual_matched = min(float(legacy_renewable_generation.sum()), float(all_load.sum()))

    daily = _rollup(interval, "D")
    weekly = _rollup(interval, "W-MON")
    monthly = _rollup(interval, "ME")
    annual = _rollup(interval, "YE")

    by_hour = (
        interval.assign(hour=interval.index.hour)
        .groupby("hour")
        .agg(
            avg_renewable_percent=("renewable_percent", "mean"),
            avg_emissions_intensity_g_per_kwh=("emissions_intensity_g_per_kwh", "mean"),
        )
        .reset_index()
    )
    by_weekday = (
        interval.assign(day_of_week=interval.index.day_name())
        .groupby("day_of_week")
        .agg(
            avg_renewable_percent=("renewable_percent", "mean"),
            avg_emissions_intensity_g_per_kwh=("emissions_intensity_g_per_kwh", "mean"),
        )
        .reindex(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])
        .dropna(how="all")
        .reset_index()
    )
    heatmap = interval.assign(date=interval.index.date, hour=interval.index.hour)[["date", "hour", "renewable_percent"]]

    week_bucket = interval.index.tz_localize(None).to_period("W-MON").to_timestamp().tz_localize(interval.index.tz)
    comp_rows: list[pd.DataFrame] = []
    for r in resources_for_matching:
        col = f"{r.name}_served_kwh"
        if col in interval.columns:
            t = pd.DataFrame({"week_start": week_bucket, "source": r.name, "served_kwh": interval[col]})
            comp_rows.append(t.groupby(["week_start", "source"], as_index=False)["served_kwh"].sum())
    comp_rows.append(
        pd.DataFrame({"week_start": week_bucket, "source": "grid_import", "served_kwh": interval["grid_import_kwh"]})
        .groupby(["week_start", "source"], as_index=False)["served_kwh"]
        .sum()
    )
    weekly_comp = pd.concat(comp_rows, ignore_index=True) if comp_rows else pd.DataFrame(columns=["week_start", "source", "served_kwh"])
    if len(weekly_comp):
        weekly_total = weekly_comp.groupby("week_start")["served_kwh"].transform("sum").replace(0, 1e-12)
        weekly_comp["served_percent"] = 100.0 * weekly_comp["served_kwh"] / weekly_total
    else:
        weekly_comp["served_percent"] = []

    served_cols = [
        c
        for c in interval.columns
        if c.endswith("_served_kwh") and c not in {"renewable_served_kwh", "sss_served_kwh"}
    ]
    served_total = interval[served_cols].sum(axis=1) if served_cols else pd.Series(0.0, index=idx)
    annual_grid_ef = float(interval["residual_ef_kg_per_kwh"].mean()) if len(interval) else 0.0
    annual_unmatched_legacy_kwh = max(0.0, total_load - legacy_annual_matched)
    annual_sss_emissions_kg = float(interval["sss_emissions_kg"].sum()) if "sss_emissions_kg" in interval.columns else 0.0
    annual_reported_emissions_kg = float(annual_unmatched_legacy_kwh * annual_grid_ef) + annual_sss_emissions_kg
    energy_price = float(project.energy_price_usd_per_mwh)
    annual_rec_price = float(project.annual_rec_usd_per_mwh)
    hourly_teac_price = float(project.hourly_teac_usd_per_mwh)
    carbon_tax = float(project.carbon_tax_usd_per_tco2e)
    adjacent_zone_multiplier = float(project.adjacent_zone_cost_multiplier)

    def _resource_cost_multiplier(resource: ResourceSeries) -> float:
        return adjacent_zone_multiplier if resource.locationality_preset == "adjacent_zone" else 1.0

    old_energy_cost = (total_load / 1000.0) * energy_price
    old_rec_cost = 0.0
    for resource in legacy_resources_for_annual:
        if resource.is_renewable:
            old_rec_cost += (float(resource.energy_kwh.sum()) / 1000.0) * annual_rec_price * _resource_cost_multiplier(resource)
    old_tax = (annual_reported_emissions_kg / 1000.0) * carbon_tax
    new_energy_cost = (total_load / 1000.0) * energy_price
    new_rec_cost = 0.0
    for resource in resources_for_matching:
        if resource.is_renewable:
            served_col = f"{resource.name}_served_kwh"
            served_total = float(interval[served_col].sum()) if served_col in interval.columns else 0.0
            new_rec_cost += (served_total / 1000.0) * hourly_teac_price * _resource_cost_multiplier(resource)
    new_tax = (total_emissions / 1000.0) * carbon_tax

    summary = {
        "total_load_kwh": total_load,
        "total_emissions_kgco2e": total_emissions,
        "true_emissions_kgco2e": total_emissions,
        "reported_annual_emissions_kgco2e": annual_reported_emissions_kg,
        "emissions_intensity_kgco2e_per_kwh": total_emissions / total_load if total_load > 0 else 0.0,
        "emissions_intensity_g_per_kwh": (1000.0 * total_emissions / total_load) if total_load > 0 else 0.0,
        "hourly_matched_energy_kwh": float(hourly_matched.sum()),
        "hourly_matching_percent": float(hourly_matched.sum() / total_load) if total_load > 0 else 0.0,
        "legacy_annual_matching_percent": float(legacy_annual_matched / total_load) if total_load > 0 else 0.0,
        "unmatched_energy_kwh": float(unmatched.sum()),
        "grid_served_kwh": float(interval["grid_import_kwh"].sum()),
        "sss_served_kwh": float(interval["sss_served_kwh"].sum()) if "sss_served_kwh" in interval.columns else 0.0,
        "sss_emissions_kgco2e": float(interval["sss_emissions_kg"].sum()) if "sss_emissions_kg" in interval.columns else 0.0,
        "residual_emissions_kgco2e": float(interval["grid_emissions_kg"].sum()),
        "renewable_served_kwh": float(interval["renewable_served_kwh"].sum()),
        "energy_balance_error_kwh": float(
            (interval["load_kwh"] - (served_total + interval["grid_import_kwh"] + interval["sss_served_kwh"])).abs().sum()
        ),
        "emissions_mode": emissions_mode.value,
        "financial_old_energy_cost_usd": old_energy_cost,
        "financial_old_rec_cost_usd": old_rec_cost,
        "financial_old_tax_usd": old_tax,
        "financial_old_total_usd": old_energy_cost + old_rec_cost + old_tax,
        "financial_new_energy_cost_usd": new_energy_cost,
        "financial_new_rec_cost_usd": new_rec_cost,
        "financial_new_tax_usd": new_tax,
        "financial_new_total_usd": new_energy_cost + new_rec_cost + new_tax,
        "financial_delta_usd": (new_energy_cost + new_rec_cost + new_tax) - (old_energy_cost + old_rec_cost + old_tax),
    }

    goal = {
        "interval": _goal_achievement(
            interval[["renewable_percent", "emissions_intensity_g_per_kwh"]],
            project.interval_renewable_target_percent,
            project.interval_emissions_target_g_per_kwh,
        ),
        "daily": _goal_achievement(daily, project.daily_renewable_target_percent, project.daily_emissions_target_g_per_kwh),
        "weekly": _goal_achievement(weekly, project.weekly_renewable_target_percent, project.weekly_emissions_target_g_per_kwh),
        "monthly": _goal_achievement(
            monthly, project.monthly_renewable_target_percent, project.monthly_emissions_target_g_per_kwh
        ),
    }

    return ViewOutput(
        summary=summary,
        interval=interval.reset_index().rename(columns={"index": "timestamp"}),
        daily_rollup=daily.reset_index().rename(columns={"index": "timestamp"}),
        weekly_rollup=weekly.reset_index().rename(columns={"index": "timestamp"}),
        monthly_rollup=monthly.reset_index().rename(columns={"index": "timestamp"}),
        annual_rollup=annual.reset_index().rename(columns={"index": "timestamp"}),
        by_hour=by_hour,
        by_weekday=by_weekday,
        heatmap=heatmap.reset_index(drop=True),
        weekly_composition=weekly_comp,
        goal_achievement=goal,
    )


def simulate(
    load_kwh: pd.Series,
    resources: list[ResourceSeries],
    grid_ef_kg_per_kwh: pd.Series,
    project: ProjectConfig,
    emissions_mode: EmissionsMode,
    logs: list[str],
    sss_ef_kg_per_kwh: Optional[pd.Series] = None,
) -> SimulationOutput:
    eligible_resources: list[ResourceSeries] = []
    for r in resources:
        eligible = r.locationality_preset != "unconnected"
        if not eligible:
            logs.append(
                f"Resource '{r.name}' excluded from eligible view due to locationality preset '{r.locationality_preset}'"
            )
        else:
            eligible_resources.append(r)

    sss_ef_series = sss_ef_kg_per_kwh if sss_ef_kg_per_kwh is not None else grid_ef_kg_per_kwh

    physical_interval = _allocate_interval(
        load_kwh,
        resources,
        grid_ef_kg_per_kwh,
        project.sss_share_percent,
        sss_ef_series,
    )
    eligible_interval = _allocate_interval(
        load_kwh,
        eligible_resources,
        grid_ef_kg_per_kwh,
        project.sss_share_percent,
        sss_ef_series,
    )

    physical_view = _view_from_interval(
        physical_interval,
        resources,
        resources,
        load_kwh,
        project,
        emissions_mode,
    )
    eligible_view = _view_from_interval(
        eligible_interval,
        eligible_resources,
        resources,
        load_kwh,
        project,
        emissions_mode,
    )

    return SimulationOutput(physical=physical_view, eligible=eligible_view, logs=logs)
