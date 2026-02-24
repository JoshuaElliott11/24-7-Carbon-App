from __future__ import annotations

import json
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
DEFAULTS_DIR = ROOT / "defaults"


def load_json(name: str) -> dict[str, Any]:
    path = DEFAULTS_DIR / name
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def technology_defaults() -> dict[str, Any]:
    return load_json("technology_efs.json")


def grid_defaults() -> dict[str, Any]:
    return load_json("grid_intensity_country.json")


def demo_profiles() -> dict[str, Any]:
    return load_json("demo_profiles.json")
