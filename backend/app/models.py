from __future__ import annotations

from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field


class FillStrategy(str, Enum):
    reject = "reject"
    forward_fill = "forward_fill"
    interpolate = "interpolate"
    zero_fill = "zero_fill"


class EmissionsMode(str, Enum):
    operational = "operational"
    lifecycle = "lifecycle"


class ResourceType(str, Enum):
    supply = "supply"
    grid = "grid"


class ResourceConfig(BaseModel):
    name: str
    resource_type: ResourceType = ResourceType.supply
    energy_unit: Literal["kwh", "mwh", "gwh"] = "kwh"
    emissions_unit: Literal["kgco2e_per_kwh", "gco2e_per_kwh", "tco2e_per_mwh"] = "kgco2e_per_kwh"
    locationality_preset: Literal["same_zone", "adjacent_zone", "unconnected"] = "same_zone"
    default_technology: Optional[str] = None
    constant_energy: Optional[float] = None
    constant_ef: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class ProjectConfig(BaseModel):
    timezone: str = "UTC"
    site_latitude: Optional[float] = None
    site_longitude: Optional[float] = None
    sss_share_percent: float = Field(default=0.0, ge=0.0, le=100.0)
    fill_strategy: FillStrategy = FillStrategy.reject
    emissions_mode: EmissionsMode = EmissionsMode.operational
    carbon_tax_usd_per_tco2e: float = Field(default=85.0, ge=0.0)
    annual_rec_usd_per_mwh: float = Field(default=5.0, ge=0.0)
    hourly_teac_usd_per_mwh: float = Field(default=15.0, ge=0.0)
    energy_price_usd_per_mwh: float = Field(default=65.0, ge=0.0)
    interval_renewable_target_percent: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    interval_emissions_target_g_per_kwh: Optional[float] = Field(default=None, ge=0.0)
    daily_renewable_target_percent: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    daily_emissions_target_g_per_kwh: Optional[float] = Field(default=None, ge=0.0)
    weekly_renewable_target_percent: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    weekly_emissions_target_g_per_kwh: Optional[float] = Field(default=None, ge=0.0)
    monthly_renewable_target_percent: Optional[float] = Field(default=None, ge=0.0, le=100.0)
    monthly_emissions_target_g_per_kwh: Optional[float] = Field(default=None, ge=0.0)


class SimulationRequest(BaseModel):
    project: ProjectConfig
    use_demo: bool = False


class SummaryMetrics(BaseModel):
    total_load_kwh: float
    total_emissions_kgco2e: float
    emissions_intensity_kgco2e_per_kwh: float
    hourly_matching_percent: float
    legacy_annual_matching_percent: float
    unmatched_energy_kwh: float
