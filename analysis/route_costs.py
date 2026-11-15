"""Baseline and transparent sensitivity analyses for route costs."""

from __future__ import annotations

from typing import Any, Sequence

import numpy as np


Point = tuple[float, float]


def route_length(points: Sequence[Point]) -> float:
    if len(points) < 2:
        raise ValueError("At least two route points are required")
    return float(sum(np.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(points, points[1:])))


def baseline_cost(points: Sequence[Point], speed_mps: float, dwell_min: float = 0.0, stop_count: int = 0) -> float:
    if speed_mps <= 0 or dwell_min < 0:
        raise ValueError("speed_mps must be positive and dwell_min nonnegative")
    return route_length(points) / speed_mps / 60.0 + stop_count * dwell_min


def slope_penalty_cost(points: Sequence[Point], slope_deg: Sequence[float], speed_mps: float,
                       penalty_per_degree: float = 0.0, dwell_min: float = 0.0, stop_count: int = 0) -> float:
    if len(slope_deg) != len(points) - 1:
        raise ValueError("one slope value is required per route segment")
    base = baseline_cost(points, speed_mps, dwell_min, stop_count)
    lengths = np.asarray([np.hypot(b[0] - a[0], b[1] - a[1]) for a, b in zip(points, points[1:])])
    penalties = np.maximum(np.asarray(slope_deg, dtype=float), 0.0) * penalty_per_degree
    return float(base + np.sum(lengths * penalties) / speed_mps / 60.0)


def route_experiment(points: Sequence[Point], segment_slopes: Sequence[float], speed_mps: float,
                    stop_count: int = 0, dwell_min: float = 0.0,
                    penalty_values: Sequence[float] = (0.0, 0.02, 0.05, 0.1)) -> dict[str, Any]:
    rows = []
    for penalty in penalty_values:
        rows.append({"penaltyPerDegree": float(penalty), "durationMin": slope_penalty_cost(
            points, segment_slopes, speed_mps, float(penalty), dwell_min, stop_count)})
    return {
        "routeLengthM": route_length(points),
        "baselineDurationMin": baseline_cost(points, speed_mps, dwell_min, stop_count),
        "sensitivity": rows,
        "scientificNote": "Penalty coefficients are hypothetical sensitivity parameters because no validated astronaut mobility model is bundled.",
    }
