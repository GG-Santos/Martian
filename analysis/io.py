"""High-level loading of Earthapps' bundled Jezero dataset."""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np

from .schema import GridSpec, load_float_grid, load_uint8_grid, validate_manifest


@dataclass
class JezeroDataset:
    root: Path
    manifest: dict[str, Any]
    heights_m: np.ndarray
    relief_m: np.ndarray | None
    slope_encoded: np.ndarray
    thermal_dn: np.ndarray
    analysis_grid: GridSpec
    relief_grid: GridSpec | None

    @property
    def slope_deg(self) -> np.ndarray:
        return np.where(self.slope_encoded == 255, np.nan, self.slope_encoded / 4.0)

    @property
    def thermal_valid(self) -> np.ndarray:
        return self.thermal_dn != 0

    @property
    def height_valid(self) -> np.ndarray:
        return np.isfinite(self.heights_m)


def load_jezero(root: str | Path, verify_hashes: bool = True) -> JezeroDataset:
    root = Path(root).resolve()
    manifest = validate_manifest(root, verify_hashes=verify_hashes)
    heights = load_float_grid(root, manifest, "heights.f32")
    slope = load_uint8_grid(root, manifest, "slope.u8")
    thermal = load_uint8_grid(root, manifest, "thermal.u8")
    relief = None
    if "reliefGrid" in manifest:
        relief = load_float_grid(root, manifest, "relief.f32", "relief")
    return JezeroDataset(
        root=root,
        manifest=manifest,
        heights_m=heights,
        relief_m=relief,
        slope_encoded=slope,
        thermal_dn=thermal,
        analysis_grid=manifest["_grids"]["analysis"],
        relief_grid=manifest["_grids"].get("relief"),
    )
