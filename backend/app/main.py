from __future__ import annotations

from pathlib import Path
from typing import Any, Literal, Optional

import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .compute import ResourceSeries, simulate
from .defaults import demo_profiles, grid_defaults, technology_defaults
from .models import ProjectConfig
from .report import build_html_report
from .validators import (
    ValidationError,
    ValidationLog,
    align_to_load_index,
    convert_ef_to_kg_per_kwh,
    convert_energy_to_kwh,
    ensure_non_negative,
)


class SeriesPoint(BaseModel):
    timestamp: str
    value: float


class ResourcePayload(BaseModel):
    name: str
    is_renewable: bool = True
    energy_unit: Literal["kwh", "mwh", "gwh"] = "kwh"
    emissions_unit: Literal["kgco2e_per_kwh", "gco2e_per_kwh", "tco2e_per_mwh"] = "kgco2e_per_kwh"
    ef_input_mode: Literal["constant", "timeseries", "default_technology"] = "default_technology"
    default_technology: Optional[str] = None
    constant_ef: Optional[float] = None
    energy_series: list[SeriesPoint] = Field(default_factory=list)
    ef_series: list[SeriesPoint] = Field(default_factory=list)
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class GridPayload(BaseModel):
    emissions_unit: Literal["kgco2e_per_kwh", "gco2e_per_kwh", "tco2e_per_mwh"] = "kgco2e_per_kwh"
    ef_input_mode: Literal["constant", "timeseries", "country_default"] = "country_default"
    constant_ef: Optional[float] = None
    ef_series: list[SeriesPoint] = Field(default_factory=list)
    country_code: Optional[str] = "GB"


class SimulationPayload(BaseModel):
    project: ProjectConfig
    load_series: list[SeriesPoint]
    resources: list[ResourcePayload] = Field(default_factory=list)
    grid: GridPayload
    use_demo: bool = False
    demo_scenario: Optional[str] = None


app = FastAPI(title="24-7 Carbon Simulator")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


ROOT = Path(__file__).resolve().parents[2]
PUBLIC_DIR = ROOT / "frontend" / "public"
MAX_INTERVAL_ROWS = 100_000


def _series_from_points(points: list[SeriesPoint]) -> pd.Series:
    if not points:
        return pd.Series(dtype=float)
    if len(points) > MAX_INTERVAL_ROWS:
        raise ValidationError(
            f"Series has {len(points)} rows, exceeds max allowed {MAX_INTERVAL_ROWS}. "
            "Use a smaller interval window or aggregate the data."
        )
    df = pd.DataFrame([{"timestamp": p.timestamp, "value": p.value} for p in points])
    if df["timestamp"].duplicated().any():
        raise ValidationError("Duplicate timestamps are not allowed")
    ts = pd.to_datetime(df["timestamp"], utc=False, errors="coerce")
    if ts.isna().any() or ts.dt.tz is None:
        raise ValidationError("All timestamps must be ISO-8601 with timezone")
    values = pd.to_numeric(df["value"], errors="coerce")
    if values.isna().any():
        raise ValidationError("Invalid numeric values in series")
    return pd.Series(values.to_numpy(), index=ts).sort_index()


def _resource_ef_series(
    resource: ResourcePayload,
    load_index: pd.DatetimeIndex,
    project: ProjectConfig,
    log: ValidationLog,
    tech_defaults: dict[str, Any],
) -> pd.Series:
    if resource.ef_input_mode == "timeseries":
        if not resource.ef_series:
            raise ValidationError(f"Resource '{resource.name}' requires EF CSV timeseries when ef_input_mode=timeseries")
        ef = _series_from_points(resource.ef_series)
        ef = align_to_load_index(ef, load_index, project.fill_strategy, log)
        return ef.apply(lambda v: convert_ef_to_kg_per_kwh(v, resource.emissions_unit))

    if resource.ef_input_mode == "constant":
        if resource.constant_ef is None:
            raise ValidationError(f"Resource '{resource.name}' requires constant_ef when ef_input_mode=constant")
        return pd.Series(convert_ef_to_kg_per_kwh(resource.constant_ef, resource.emissions_unit), index=load_index)

    if resource.default_technology is None or resource.default_technology not in tech_defaults:
        raise ValidationError(
            f"Resource '{resource.name}' requires default_technology when ef_input_mode=default_technology"
        )
    default_key = f"{project.emissions_mode.value}_gco2e_per_kwh"
    value = float(tech_defaults[resource.default_technology][default_key]) / 1000.0
    log.messages.append(f"Applied default technology EF for {resource.name}: {resource.default_technology}")
    return pd.Series(value, index=load_index)


def _grid_ef_series(
    grid: GridPayload,
    load_index: pd.DatetimeIndex,
    project: ProjectConfig,
    log: ValidationLog,
    grid_defaults_map: dict[str, float],
) -> pd.Series:
    if grid.ef_input_mode == "timeseries":
        if not grid.ef_series:
            raise ValidationError("Grid requires EF CSV timeseries when ef_input_mode=timeseries")
        ef = _series_from_points(grid.ef_series)
        ef = align_to_load_index(ef, load_index, project.fill_strategy, log)
        return ef.apply(lambda v: convert_ef_to_kg_per_kwh(v, grid.emissions_unit))

    if grid.ef_input_mode == "constant":
        if grid.constant_ef is None:
            raise ValidationError("Grid requires constant_ef when ef_input_mode=constant")
        return pd.Series(convert_ef_to_kg_per_kwh(grid.constant_ef, grid.emissions_unit), index=load_index)

    code = (grid.country_code or "GB").upper()
    if code not in grid_defaults_map:
        raise ValidationError(f"Unsupported grid country code for default EF: {code}")
    value = float(grid_defaults_map[code])
    log.messages.append(f"Applied default grid EF from country default: {code}")
    return pd.Series(value, index=load_index)


def _simulate_from_payload(payload: SimulationPayload) -> dict[str, Any]:
    log = ValidationLog(messages=[])
    grid_defaults_map = grid_defaults()["country_kgco2e_per_kwh"]
    tech_defaults = technology_defaults()["technologies"]

    if payload.use_demo:
        demo = demo_profiles()
        if "scenarios" in demo and demo["scenarios"]:
            scenario_id = payload.demo_scenario or demo.get("default_scenario")
            scenarios = {s["id"]: s for s in demo["scenarios"]}
            if scenario_id not in scenarios:
                raise ValidationError(f"Unknown demo_scenario '{scenario_id}'.")
            selected = scenarios[scenario_id]
            payload.load_series = [SeriesPoint(timestamp=r["timestamp"], value=r["load_kwh"]) for r in selected["load_profile"]]
            payload.resources = [ResourcePayload(**r) for r in selected["resources"]]
            payload.grid = GridPayload(**selected["grid"])
        else:
            payload.load_series = [SeriesPoint(timestamp=r["timestamp"], value=r["load_kwh"]) for r in demo["load_profile"]]
            payload.resources = [ResourcePayload(**r) for r in demo["resources"]]
            payload.grid = GridPayload(**demo["grid"])

    load = _series_from_points(payload.load_series)
    load.name = "load_kwh"
    ensure_non_negative(load, "load_kwh")
    if load.empty:
        raise ValidationError("Load timeseries is required")

    resource_objs: list[ResourceSeries] = []
    for resource in payload.resources:
        if not resource.energy_series:
            raise ValidationError(f"Resource '{resource.name}' requires energy CSV timeseries")
        energy = _series_from_points(resource.energy_series)
        energy = align_to_load_index(energy, load.index, payload.project.fill_strategy, log)
        energy = energy.apply(lambda v: convert_energy_to_kwh(v, resource.energy_unit))
        ef = _resource_ef_series(resource, load.index, payload.project, log, tech_defaults)

        ensure_non_negative(energy, f"{resource.name} energy")
        ensure_non_negative(ef, f"{resource.name} ef")

        resource_objs.append(
            ResourceSeries(
                name=resource.name,
                energy_kwh=energy,
                ef_kg_per_kwh=ef,
                is_renewable=resource.is_renewable,
                latitude=resource.latitude,
                longitude=resource.longitude,
            )
        )

    grid_ef = _grid_ef_series(payload.grid, load.index, payload.project, log, grid_defaults_map)
    ensure_non_negative(grid_ef, "grid ef")

    output = simulate(
        load_kwh=load,
        resources=resource_objs,
        grid_ef_kg_per_kwh=grid_ef,
        project=payload.project,
        emissions_mode=payload.project.emissions_mode,
        logs=log.messages,
    )

    explainers = {
        "matched_unmatched": (
            "Hourly matched energy is the per-interval minimum of load and eligible deliverable generation. "
            "Unmatched energy is the remaining load not hourly-covered by eligible deliverable generation."
        ),
        "hourly_vs_legacy": (
            "Hourly matching requires same-interval matching. Legacy annual matching allows annual netting, so "
            "surplus clean generation in one hour can offset deficit in another when annual totals are computed."
        ),
        "deliverability_scope": (
            "Resources outside deliverability radius can still serve physical load in this simulator, but they are "
            "excluded from market-based hourly matching and eligible-deliverable metrics."
        ),
        "interval_emissions": (
            "Interval emissions = sum(resource served_kWh * resource EF) + (grid import_kWh * grid EF). "
            "Spilled generation does not serve load and is not counted toward served-energy emissions."
        ),
    }

    report_html = build_html_report({"summary": output.eligible.summary, "logs": output.logs})

    return {
        "summary": {
            "physical": output.physical.summary,
            "eligible": output.eligible.summary,
        },
        "explainers": explainers,
        "logs": output.logs,
        "views": {
            "physical": {
                "interval_results": output.physical.interval.to_dict(orient="records"),
                "daily_rollup": output.physical.daily_rollup.to_dict(orient="records"),
                "weekly_rollup": output.physical.weekly_rollup.to_dict(orient="records"),
                "monthly_rollup": output.physical.monthly_rollup.to_dict(orient="records"),
                "annual_rollup": output.physical.annual_rollup.to_dict(orient="records"),
                "by_hour": output.physical.by_hour.to_dict(orient="records"),
                "by_weekday": output.physical.by_weekday.to_dict(orient="records"),
                "heatmap": output.physical.heatmap.to_dict(orient="records"),
                "weekly_composition": output.physical.weekly_composition.to_dict(orient="records"),
                "goal_achievement": output.physical.goal_achievement,
            },
            "eligible": {
                "interval_results": output.eligible.interval.to_dict(orient="records"),
                "daily_rollup": output.eligible.daily_rollup.to_dict(orient="records"),
                "weekly_rollup": output.eligible.weekly_rollup.to_dict(orient="records"),
                "monthly_rollup": output.eligible.monthly_rollup.to_dict(orient="records"),
                "annual_rollup": output.eligible.annual_rollup.to_dict(orient="records"),
                "by_hour": output.eligible.by_hour.to_dict(orient="records"),
                "by_weekday": output.eligible.by_weekday.to_dict(orient="records"),
                "heatmap": output.eligible.heatmap.to_dict(orient="records"),
                "weekly_composition": output.eligible.weekly_composition.to_dict(orient="records"),
                "goal_achievement": output.eligible.goal_achievement,
            },
        },
        "report_html": report_html,
    }


@app.get("/")
def root() -> RedirectResponse:
    return RedirectResponse(url="/ui")


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/defaults")
def defaults() -> dict[str, Any]:
    return {
        "technology_efs": technology_defaults(),
        "grid_intensity": grid_defaults(),
        "demo": demo_profiles(),
    }


@app.post("/api/simulate")
def run_simulation(payload: SimulationPayload) -> dict[str, Any]:
    try:
        return _simulate_from_payload(payload)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:  # pragma: no cover
        raise HTTPException(status_code=500, detail=f"Simulation failed: {e}") from e


if PUBLIC_DIR.exists():
    app.mount("/ui", StaticFiles(directory=PUBLIC_DIR, html=True), name="static")
