from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

import pandas as pd

from .models import FillStrategy


@dataclass
class ValidationLog:
    messages: list[str]


class ValidationError(ValueError):
    pass


UNIT_TO_KWH = {"kwh": 1.0, "mwh": 1000.0, "gwh": 1_000_000.0}
EF_TO_KG_PER_KWH = {
    "kgco2e_per_kwh": 1.0,
    "gco2e_per_kwh": 0.001,
    "tco2e_per_mwh": 1.0,
}


def convert_energy_to_kwh(value: float, unit: str) -> float:
    if unit not in UNIT_TO_KWH:
        raise ValidationError(f"Unsupported energy unit: {unit}")
    return float(value) * UNIT_TO_KWH[unit]


def convert_ef_to_kg_per_kwh(value: float, unit: str) -> float:
    if unit not in EF_TO_KG_PER_KWH:
        raise ValidationError(f"Unsupported emissions unit: {unit}")
    return float(value) * EF_TO_KG_PER_KWH[unit]


def parse_timeseries_csv(
    content: bytes,
    value_column: str,
    strategy: FillStrategy,
    log: ValidationLog,
) -> pd.Series:
    df = pd.read_csv(pd.io.common.BytesIO(content))
    if "timestamp" not in df.columns or value_column not in df.columns:
        raise ValidationError(f"CSV must contain 'timestamp' and '{value_column}' columns")
    if df["timestamp"].duplicated().any():
        raise ValidationError("Duplicate timestamps are not allowed")

    ts = pd.to_datetime(df["timestamp"], utc=False, errors="coerce")
    if ts.isna().any():
        raise ValidationError("Invalid timestamps detected")
    if ts.dt.tz is None:
        raise ValidationError("All timestamps must include timezone offset")

    values = pd.to_numeric(df[value_column], errors="coerce")
    if values.isna().any():
        raise ValidationError(f"Invalid numeric value in '{value_column}'")

    series = pd.Series(values.to_numpy(), index=ts).sort_index()
    return enforce_regular_interval(series, strategy, log)


def enforce_regular_interval(series: pd.Series, strategy: FillStrategy, log: ValidationLog) -> pd.Series:
    if len(series.index) < 2:
        return series

    diffs = series.index.to_series().diff().dropna()
    base_delta = diffs.mode().iloc[0]
    expected_idx = pd.date_range(series.index.min(), series.index.max(), freq=base_delta, tz=series.index.tz)
    aligned = series.reindex(expected_idx)

    if aligned.isna().sum() == 0:
        return aligned

    missing = int(aligned.isna().sum())
    if strategy == FillStrategy.reject:
        raise ValidationError(f"Missing intervals detected: {missing}. Choose a fill strategy.")
    if strategy == FillStrategy.forward_fill:
        log.messages.append(f"Applied forward_fill for {missing} missing intervals")
        return aligned.ffill().fillna(0.0)
    if strategy == FillStrategy.interpolate:
        log.messages.append(f"Applied interpolate for {missing} missing intervals")
        return aligned.interpolate(method="time").fillna(0.0)
    log.messages.append(f"Applied zero_fill for {missing} missing intervals")
    return aligned.fillna(0.0)


def align_to_load_index(series: pd.Series, load_index: pd.DatetimeIndex, strategy: FillStrategy, log: ValidationLog) -> pd.Series:
    aligned = series.reindex(load_index)
    if aligned.isna().sum() == 0:
        return aligned
    missing = int(aligned.isna().sum())
    if strategy == FillStrategy.reject:
        raise ValidationError(f"Series missing {missing} load intervals")
    if strategy == FillStrategy.forward_fill:
        log.messages.append(f"Aligned with forward_fill for {missing} intervals")
        return aligned.ffill().fillna(0.0)
    if strategy == FillStrategy.interpolate:
        log.messages.append(f"Aligned with interpolation for {missing} intervals")
        return aligned.interpolate(method="time").fillna(0.0)
    log.messages.append(f"Aligned with zero_fill for {missing} intervals")
    return aligned.fillna(0.0)


def ensure_non_negative(series: pd.Series, name: str) -> None:
    if (series < 0).any():
        raise ValidationError(f"Negative values found in {name}")


def sum_series(series_list: Iterable[pd.Series], index: pd.DatetimeIndex) -> pd.Series:
    total = pd.Series(0.0, index=index)
    for s in series_list:
        total = total.add(s, fill_value=0.0)
    return total
