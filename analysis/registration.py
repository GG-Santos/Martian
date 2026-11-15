"""Cross-layer coordinate and coverage checks derived from manifest metadata."""

from __future__ import annotations

from typing import Any

import numpy as np

from .io import JezeroDataset


def registration_report(dataset: JezeroDataset) -> dict[str, Any]:
    analysis = dataset.analysis_grid
    manifest_bounds = dataset.manifest["bounds"]
    declared = (manifest_bounds["westM"], manifest_bounds["eastM"], manifest_bounds["southM"], manifest_bounds["northM"])
    checks: dict[str, bool] = {
        "analysisMatchesManifestBounds": bool(np.allclose(analysis.extent, declared)),
        "heightShapeMatchesGrid": dataset.heights_m.shape == (analysis.height, analysis.width),
        "slopeShapeMatchesGrid": dataset.slope_encoded.shape == (analysis.height, analysis.width),
        "thermalShapeMatchesGrid": dataset.thermal_dn.shape == (analysis.height, analysis.width),
    }
    if dataset.relief_grid is not None:
        checks["reliefSharesAnalysisCoverage"] = bool(np.allclose(dataset.relief_grid.extent, analysis.extent))
    controls = dataset.manifest.get("controlPoints", [])
    residuals = [float(c["centerResidualM"]) for c in controls if isinstance(c, dict) and np.isfinite(c.get("centerResidualM", np.nan))]
    return {
        "checks": checks,
        "allChecksPass": all(checks.values()),
        "controlPointCount": len(controls),
        "controlPointResidualsM": residuals,
        "maxControlPointResidualM": max(residuals, default=None),
        "sourceCrs": dataset.manifest.get("sourceCrs"),
        "localTransform": dataset.manifest.get("localTransform"),
        "note": "These checks assess declared processing registration and array alignment, not independent geodetic accuracy or inter-mission co-registration accuracy.",
    }
