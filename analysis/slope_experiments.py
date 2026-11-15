"""Slope estimators and comparisons against Earthapps' encoded baseline."""

from __future__ import annotations

import time
from typing import Any

import numpy as np

from .io import JezeroDataset


def finite_difference_slope(elevation_m: np.ndarray, spacing_m: float) -> np.ndarray:
    gy, gx = np.gradient(elevation_m, spacing_m)
    return np.degrees(np.arctan(np.hypot(gx, gy)))


def horn_slope(elevation_m: np.ndarray, spacing_m: float) -> np.ndarray:
    p = np.pad(elevation_m, 1, mode="edge")
    z1, z2, z3 = p[:-2, :-2], p[:-2, 1:-1], p[:-2, 2:]
    z4, z6 = p[1:-1, :-2], p[1:-1, 2:]
    z7, z8, z9 = p[2:, :-2], p[2:, 1:-1], p[2:, 2:]
    dx = ((z3 + 2 * z6 + z9) - (z1 + 2 * z4 + z7)) / (8 * spacing_m)
    dy = ((z7 + 2 * z8 + z9) - (z1 + 2 * z2 + z3)) / (8 * spacing_m)
    return np.degrees(np.arctan(np.hypot(dx, dy)))


def slope_experiment(dataset: JezeroDataset) -> dict[str, Any]:
    start = time.perf_counter()
    baseline = finite_difference_slope(dataset.heights_m, dataset.analysis_grid.cell_size_m)
    horn_start = time.perf_counter()
    alternative = horn_slope(dataset.heights_m, dataset.analysis_grid.cell_size_m)
    encoded = dataset.slope_deg
    valid = np.isfinite(encoded) & np.isfinite(baseline) & np.isfinite(alternative)
    def summary(candidate: np.ndarray) -> dict[str, float | int]:
        difference = candidate[valid] - encoded[valid]
        return {"maeDeg": float(np.mean(np.abs(difference))), "rmseDeg": float(np.sqrt(np.mean(difference ** 2))),
                "maxAbsDeg": float(np.max(np.abs(difference))), "above15Count": int(np.count_nonzero(candidate[valid] > 15))}
    return {
        "baseline": summary(baseline),
        "horn": summary(alternative),
        "baselineRuntimeSec": time.perf_counter() - start,
        "hornRuntimeSec": time.perf_counter() - horn_start,
        "validFraction": float(valid.mean()),
        "baselineDeg": baseline,
        "hornDeg": alternative,
        "encodedDeg": encoded,
        "scientificNote": "Horn is a smoothing-sensitive alternative; without independent slope ground truth, this is a sensitivity experiment, not an accuracy claim.",
    }
