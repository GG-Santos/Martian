"""Descriptive terrain and data-quality metrics."""

from __future__ import annotations

from typing import Any

import numpy as np

from .io import JezeroDataset


def finite_stats(values: np.ndarray, valid: np.ndarray | None = None) -> dict[str, float | int]:
    mask = np.isfinite(values) if valid is None else np.isfinite(values) & valid
    selected = values[mask]
    if selected.size == 0:
        return {"count": 0}
    q = np.percentile(selected, [1, 5, 25, 50, 75, 95, 99])
    return {
        "count": int(selected.size),
        "min": float(selected.min()),
        "max": float(selected.max()),
        "mean": float(selected.mean()),
        "std": float(selected.std()),
        "p01": float(q[0]), "p05": float(q[1]), "p25": float(q[2]),
        "median": float(q[3]), "p75": float(q[4]), "p95": float(q[5]), "p99": float(q[6]),
    }


def quality_report(dataset: JezeroDataset) -> dict[str, Any]:
    h = dataset.heights_m
    slope = dataset.slope_deg
    thermal_valid = dataset.thermal_valid
    return {
        "datasetId": dataset.manifest["datasetId"],
        "sourceCrs": dataset.manifest["sourceCrs"],
        "verticalDatum": dataset.manifest.get("verticalDatum"),
        "analysisGrid": dataset.analysis_grid.__dict__,
        "reliefGrid": dataset.relief_grid.__dict__ if dataset.relief_grid else None,
        "boundsM": dataset.analysis_grid.extent,
        "height": finite_stats(h),
        "slopeDecodedDeg": finite_stats(slope),
        "thermalDn": finite_stats(dataset.thermal_dn, thermal_valid),
        "coverage": {
            "heightFiniteFraction": float(np.isfinite(h).mean()),
            "slopeMissingFraction": float(np.isnan(slope).mean()),
            "thermalMissingFraction": float((~thermal_valid).mean()),
        },
        "nodata": {"height": "NaN", "slope": 255, "thermal": 0},
        "provenance": [
            {k: layer.get(k) for k in ("id", "mission", "instrument", "productId", "reference", "units", "nativeResolutionM", "outputResolutionM")}
            for layer in dataset.manifest.get("layers", [])
        ],
    }


def local_relief(values: np.ndarray, radius_cells: int = 1) -> np.ndarray:
    if radius_cells < 1:
        raise ValueError("radius_cells must be positive")
    pad = np.pad(values, radius_cells, mode="edge")
    windows = [pad[i:i + values.shape[0], j:j + values.shape[1]]
               for i in range(2 * radius_cells + 1)
               for j in range(2 * radius_cells + 1)]
    stack = np.stack(windows)
    return np.nanmax(stack, axis=0) - np.nanmin(stack, axis=0)
