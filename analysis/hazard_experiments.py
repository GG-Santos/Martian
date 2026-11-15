"""Slope threshold and connected-component hazard experiments."""

from __future__ import annotations

from collections import deque
from typing import Any

import numpy as np


def connected_components(mask: np.ndarray, diagonal: bool = False) -> list[np.ndarray]:
    if mask.ndim != 2:
        raise ValueError("mask must be two-dimensional")
    neighbors = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    if diagonal:
        neighbors += [(-1, -1), (-1, 1), (1, -1), (1, 1)]
    seen = np.zeros(mask.shape, dtype=bool)
    result: list[np.ndarray] = []
    for row, col in zip(*np.nonzero(mask & ~seen)):
        if seen[row, col]:
            continue
        queue = deque([(int(row), int(col))])
        seen[row, col] = True
        cells: list[tuple[int, int]] = []
        while queue:
            r, c = queue.popleft()
            cells.append((r, c))
            for dr, dc in neighbors:
                rr, cc = r + dr, c + dc
                if 0 <= rr < mask.shape[0] and 0 <= cc < mask.shape[1] and mask[rr, cc] and not seen[rr, cc]:
                    seen[rr, cc] = True
                    queue.append((rr, cc))
        result.append(np.asarray(cells, dtype=int))
    return result


def hazard_experiment(slope_deg: np.ndarray, thresholds: tuple[float, ...] = (10.0, 15.0, 20.0)) -> dict[str, Any]:
    valid = np.isfinite(slope_deg)
    comparisons = []
    for threshold in thresholds:
        mask = valid & (slope_deg > threshold)
        four = connected_components(mask, diagonal=False)
        eight = connected_components(mask, diagonal=True)
        comparisons.append({
            "thresholdDeg": threshold,
            "markedCells": int(mask.sum()),
            "markedFraction": float(mask.mean()),
            "fourNeighborRegions": len(four),
            "eightNeighborRegions": len(eight),
            "fourAreasCells": sorted((int(x.shape[0]) for x in four), reverse=True),
            "eightAreasCells": sorted((int(x.shape[0]) for x in eight), reverse=True),
        })
    return {
        "comparisons": comparisons,
        "scientificNote": "Thresholds and connectivity define illustrative caution zones; they do not identify confirmed physical hazards.",
    }
