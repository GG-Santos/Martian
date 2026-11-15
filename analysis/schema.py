"""Manifest and binary-asset validation without application-specific dimensions."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np


class ValidationError(ValueError):
    """Raised when a dataset violates its declared scientific contract."""


@dataclass(frozen=True)
class GridSpec:
    name: str
    width: int
    height: int
    cell_size_m: float
    west_m: float
    north_m: float

    @property
    def count(self) -> int:
        return self.width * self.height

    @property
    def east_m(self) -> float:
        return self.west_m + (self.width - 1) * self.cell_size_m

    @property
    def south_m(self) -> float:
        return self.north_m - (self.height - 1) * self.cell_size_m

    @property
    def extent(self) -> tuple[float, float, float, float]:
        return self.west_m, self.east_m, self.south_m, self.north_m


def read_json(path: Path) -> dict[str, Any]:
    with path.open(encoding="utf-8") as stream:
        value = json.load(stream)
    if not isinstance(value, dict):
        raise ValidationError(f"Expected JSON object: {path}")
    return value


def _grid(name: str, value: dict[str, Any]) -> GridSpec:
    try:
        width = int(value["width"])
        height = int(value["height"])
        cell = float(value["cellSizeM"])
        west = float(value["westM"])
        north = float(value["northM"])
    except (KeyError, TypeError, ValueError) as exc:
        raise ValidationError(f"Invalid {name} grid metadata") from exc
    if width < 2 or height < 2 or not np.isfinite([cell, west, north]).all() or cell <= 0:
        raise ValidationError(f"Invalid {name} grid dimensions or spacing")
    return GridSpec(name, width, height, cell, west, north)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def validate_manifest(root: Path, verify_hashes: bool = True) -> dict[str, Any]:
    manifest = read_json(root / "manifest.json")
    if not manifest.get("datasetId") or not manifest.get("sourceCrs"):
        raise ValidationError("Manifest is missing dataset identity or source CRS")
    grids = {"analysis": _grid("analysis", manifest["grid"])}
    if manifest.get("reliefGrid"):
        grids["relief"] = _grid("relief", manifest["reliefGrid"])
    for index, tile in enumerate(manifest.get("detailTiles", [])):
        grids[f"detail-{index}"] = _grid(f"detail-{index}", tile["grid"])
    if "bounds" not in manifest or "localTransform" not in manifest:
        raise ValidationError("Manifest is missing local coordinate metadata")
    if verify_hashes:
        for name, expected in manifest.get("assets", {}).items():
            path = root / name
            if not path.is_file():
                raise ValidationError(f"Missing registered asset: {name}")
            actual = sha256(path)
            if actual != expected:
                raise ValidationError(f"Checksum mismatch for {name}")
    manifest["_grids"] = grids
    return manifest


def load_float_grid(root: Path, manifest: dict[str, Any], asset: str, grid_name: str = "analysis") -> np.ndarray:
    grid = manifest["_grids"][grid_name]
    path = root / asset
    expected = grid.count * np.dtype("<f4").itemsize
    if path.stat().st_size != expected:
        raise ValidationError(f"{asset} has {path.stat().st_size} bytes; expected {expected}")
    values = np.fromfile(path, dtype="<f4").reshape((grid.height, grid.width))
    return values


def load_uint8_grid(root: Path, manifest: dict[str, Any], asset: str, grid_name: str = "analysis") -> np.ndarray:
    grid = manifest["_grids"][grid_name]
    path = root / asset
    if path.stat().st_size != grid.count:
        raise ValidationError(f"{asset} has {path.stat().st_size} bytes; expected {grid.count}")
    return np.fromfile(path, dtype=np.uint8).reshape((grid.height, grid.width))
