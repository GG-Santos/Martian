"""Measured terrain metrics for ordered routes on the Jezero analysis grid.

This module deliberately does not apply astronaut-mobility penalties.  It reports
terrain measurements that can be compared with the hypothetical penalty model in
``route_costs``.

Sampling follows ``src/features/terrain/spatial.ts``: coordinates use local east
and north metres, rows run north to south, and bilinear cells require all four
corners to be finite, including corners with zero interpolation weight.  A route
segment is sampled at a fixed maximum spacing and integrated as piecewise-linear
functions of along-segment distance.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Sequence

import numpy as np

from .io import JezeroDataset
from .schema import GridSpec


Point = tuple[float, float]


class RouteTerrainError(ValueError):
    """Raised when a route cannot be sampled under the declared contract."""


def _point(value: Sequence[float], index: int) -> Point:
    if len(value) != 2:
        raise RouteTerrainError(f"Route point {index} must contain exactly x and y")
    x, y = float(value[0]), float(value[1])
    if not np.isfinite([x, y]).all():
        raise RouteTerrainError(f"Route point {index} must contain finite coordinates")
    return x, y


def validate_route_points(points: Sequence[Sequence[float]]) -> tuple[Point, ...]:
    """Validate and preserve the supplied route order.

    Consecutive repeated points are rejected because they create zero-length
    segments with undefined distance-weighted statistics.  Non-consecutive
    revisits are valid and retain their original order.
    """

    if len(points) < 2:
        raise RouteTerrainError("At least two ordered route points are required")
    normalized = tuple(_point(point, index) for index, point in enumerate(points))
    for index, (first, second) in enumerate(zip(normalized, normalized[1:])):
        if first == second:
            raise RouteTerrainError(f"Route segment {index} has zero length")
    return normalized


def _validate_interval(interval_m: float, cell_size_m: float) -> float:
    interval = float(interval_m)
    if not np.isfinite(interval) or interval <= 0:
        raise RouteTerrainError("sampling_interval_m must be finite and positive")
    if not np.isfinite(cell_size_m) or cell_size_m <= 0:
        raise RouteTerrainError("Grid cell size must be finite and positive")
    return interval


def _bilinear(values: np.ndarray, grid: GridSpec, point: Point) -> float | None:
    """Match the TypeScript sampler, including strict four-corner validity."""

    x, y = point
    col_f = (x - grid.west_m) / grid.cell_size_m
    row_f = (grid.north_m - y) / grid.cell_size_m
    if not np.isfinite([col_f, row_f]).all():
        return None
    if col_f < 0 or row_f < 0 or col_f > grid.width - 1 or row_f > grid.height - 1:
        return None
    col = min(int(np.floor(col_f)), grid.width - 2)
    row = min(int(np.floor(row_f)), grid.height - 2)
    u, v = col_f - col, row_f - row
    a, b = values[row, col], values[row, col + 1]
    c, d = values[row + 1, col], values[row + 1, col + 1]
    # Deliberately validate all corners before weighting: this matches TS
    # ``vals.every(Number.isFinite)`` even when a corner has zero weight.
    if not np.isfinite([a, b, c, d]).all():
        return None
    return float(a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v)


def sample_terrain(
    dataset: JezeroDataset,
    point: Point,
) -> tuple[float, float] | None:
    """Return bilinear ``(elevation_m, slope_deg)`` or ``None`` for invalid data."""

    elevation = _bilinear(dataset.heights_m, dataset.analysis_grid, point)
    slope = _bilinear(dataset.slope_deg, dataset.analysis_grid, point)
    if elevation is None or slope is None:
        return None
    return elevation, slope


def _sample_parameters(start: Point, end: Point, interval_m: float) -> np.ndarray:
    length = float(np.hypot(end[0] - start[0], end[1] - start[1]))
    count = max(1, int(np.ceil(length / interval_m)))
    return np.linspace(0.0, 1.0, count + 1)


def _positive_linear_integral(first: float, second: float, length: float) -> float:
    """Integrate ``max(linear(first, second), 0)`` over an interval."""

    if first <= 0 and second <= 0:
        return 0.0
    if first >= 0 and second >= 0:
        return length * (first + second) / 2.0
    if first > 0:
        return length * first * first / (2.0 * (first - second))
    return length * second * second / (2.0 * (second - first))


def _interval_integrals(first_slope: float, second_slope: float, length: float, threshold_deg: float) -> tuple[float, float]:
    """Return exact piecewise-linear exposure distance and excess integral.

    Slope is linearly interpolated between adjacent samples.  Exposure distance
    is the integral of ``1[slope > threshold]``.  Excess exposure is the integral
    of ``max(slope - threshold, 0)`` and therefore has units degree-metres.
    Threshold equality is non-exposed, matching ``isCaution`` in TypeScript.
    """

    first = first_slope - threshold_deg
    second = second_slope - threshold_deg
    if first <= 0 and second <= 0:
        return 0.0, 0.0
    if first > 0 and second > 0:
        return length, _positive_linear_integral(first, second, length)
    if first > 0:
        fraction = first / (first - second)
        return length * fraction, _positive_linear_integral(first, second, length)
    if second > 0:
        fraction = second / (second - first)
        return length * fraction, _positive_linear_integral(first, second, length)
    return 0.0, 0.0


def analyze_segment(
    dataset: JezeroDataset,
    start: Point,
    end: Point,
    sampling_interval_m: float,
    threshold_deg: float = 15.0,
    segment_index: int = 0,
) -> dict[str, Any]:
    """Measure one ordered route segment with piecewise-linear integration."""

    interval = _validate_interval(sampling_interval_m, dataset.analysis_grid.cell_size_m)
    if start == end:
        raise RouteTerrainError(f"Route segment {segment_index} has zero length")
    length = float(np.hypot(end[0] - start[0], end[1] - start[1]))
    parameters = _sample_parameters(start, end, interval)
    samples: list[dict[str, float]] = []
    for parameter in parameters:
        point = (start[0] + (end[0] - start[0]) * parameter, start[1] + (end[1] - start[1]) * parameter)
        terrain = sample_terrain(dataset, point)
        if terrain is None:
            raise RouteTerrainError(
                f"Route segment {segment_index} crosses missing terrain at parameter {parameter:.9g}"
            )
        elevation, slope = terrain
        samples.append({"x": point[0], "y": point[1], "distanceM": length * float(parameter), "elevationM": elevation, "slopeDeg": slope})

    ascent = descent = slope_integral = exposure_distance = excess_integral = 0.0
    for first, second in zip(samples, samples[1:]):
        ds = second["distanceM"] - first["distanceM"]
        delta_elevation = second["elevationM"] - first["elevationM"]
        ascent += max(delta_elevation, 0.0)
        descent += max(-delta_elevation, 0.0)
        slope_integral += ds * (first["slopeDeg"] + second["slopeDeg"]) / 2.0
        exposed, excess = _interval_integrals(first["slopeDeg"], second["slopeDeg"], ds, threshold_deg)
        exposure_distance += exposed
        excess_integral += excess

    slopes = np.asarray([sample["slopeDeg"] for sample in samples], dtype=float)
    return {
        "segmentIndex": segment_index,
        "start": {"x": start[0], "y": start[1]},
        "end": {"x": end[0], "y": end[1]},
        "lengthM": length,
        "sampleCount": len(samples),
        "samplingIntervalM": interval,
        "startElevationM": samples[0]["elevationM"],
        "endElevationM": samples[-1]["elevationM"],
        "netElevationChangeM": samples[-1]["elevationM"] - samples[0]["elevationM"],
        "ascentM": ascent,
        "descentM": descent,
        "meanSlopeDeg": slope_integral / length,
        "maximumSlopeDeg": float(np.max(slopes)),
        "slopeThresholdDeg": float(threshold_deg),
        "exposureDistanceM": exposure_distance,
        "exposureFraction": exposure_distance / length,
        "integratedExcessSlopeDegM": excess_integral,
        "samples": samples,
    }


def analyze_route(
    dataset: JezeroDataset,
    points: Sequence[Sequence[float]],
    sampling_interval_m: float | None = None,
    threshold_deg: float = 15.0,
    route_label: str = "approved route export",
) -> dict[str, Any]:
    """Measure an ordered route and return a JSON-safe reproducibility report."""

    ordered = validate_route_points(points)
    interval = dataset.analysis_grid.cell_size_m / 2 if sampling_interval_m is None else sampling_interval_m
    interval = _validate_interval(interval, dataset.analysis_grid.cell_size_m)
    if not np.isfinite(threshold_deg) or threshold_deg < 0:
        raise RouteTerrainError("threshold_deg must be finite and nonnegative")
    segments = [
        analyze_segment(dataset, first, second, interval, threshold_deg, index)
        for index, (first, second) in enumerate(zip(ordered, ordered[1:]))
    ]
    return {
        "routeLabel": route_label,
        "routePointOrderPreserved": True,
        "routePoints": [{"x": x, "y": y} for x, y in ordered],
        "sampling": {
            "method": "uniform samples at no more than half-cell spacing; piecewise-linear along-segment integration",
            "intervalM": interval,
            "slopeMean": "trapezoidal integral of bilinear slope degrees divided by horizontal segment length",
            "exposureDistance": "piecewise-linear exact threshold crossing for slope > threshold",
            "integratedExcessSlope": "piecewise-linear exact integral of max(slope - threshold, 0), in degree-metres",
        },
        "segments": segments,
        "totals": {
            "routeLengthM": float(sum(segment["lengthM"] for segment in segments)),
            "ascentM": float(sum(segment["ascentM"] for segment in segments)),
            "descentM": float(sum(segment["descentM"] for segment in segments)),
            "exposureDistanceM": float(sum(segment["exposureDistanceM"] for segment in segments)),
            "integratedExcessSlopeDegM": float(sum(segment["integratedExcessSlopeDegM"] for segment in segments)),
        },
        "scientificNote": "Terrain quantities are measured from the bundled grid. Route-duration penalties remain hypothetical sensitivity parameters and are not included here.",
    }


def load_route_points(path: str | Path) -> tuple[tuple[float, float], ...]:
    """Load an approved route export or mission-style preset node JSON."""

    value = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(value, dict) and isinstance(value.get("points"), list):
        points = value["points"]
    elif isinstance(value, dict) and isinstance(value.get("nodes"), list):
        points = [node["point"] for node in value["nodes"]]
    elif isinstance(value, list):
        points = [node.get("point", node) if isinstance(node, dict) else node for node in value]
    else:
        raise RouteTerrainError("Route export must contain points, nodes, or a point list")
    return validate_route_points([(point["x"], point["y"]) if isinstance(point, dict) else point for point in points])
