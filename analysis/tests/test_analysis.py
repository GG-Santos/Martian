import json
import tempfile
import unittest
from pathlib import Path

import numpy as np

from analysis.hazard_experiments import connected_components
from analysis.route_costs import baseline_cost, route_length, slope_penalty_cost
from analysis.route_terrain import (
    RouteTerrainError,
    _bilinear,
    _interval_integrals,
    _validate_interval,
    analyze_segment,
    validate_route_points,
)
from analysis.schema import GridSpec
from analysis.slope_experiments import finite_difference_slope, horn_slope
from analysis.terrain_metrics import finite_stats, local_relief


class SyntheticAnalysisTests(unittest.TestCase):
    def test_shared_route_parity_fixture(self):
        fixture = json.loads((Path(__file__).parent / "fixtures" / "route_parity_fixture.json").read_text())
        grid = GridSpec("analysis", fixture["grid"]["width"], fixture["grid"]["height"], fixture["grid"]["cellSizeM"], fixture["grid"]["westM"], fixture["grid"]["northM"])
        values = np.asarray(fixture["grid"]["values"], dtype=float).reshape((grid.height, grid.width))
        sampled = _bilinear(values, grid, (fixture["point"]["x"], fixture["point"]["y"]))
        self.assertAlmostEqual(sampled, fixture["expected"]["elevationM"])

    def test_route_point_validation_preserves_order_and_rejects_invalid_segments(self):
        self.assertEqual(validate_route_points([(0, 0), (2, 1)]), ((0.0, 0.0), (2.0, 1.0)))
        for points in [[], [(0, 0)], [(0, 0), (0, 0)], [(0, 0), (float("nan"), 1)]]:
            with self.assertRaises(RouteTerrainError):
                validate_route_points(points)

    def test_piecewise_linear_integrals_have_known_threshold_crossing(self):
        exposure, excess = _interval_integrals(10, 20, 10, 15)
        self.assertAlmostEqual(exposure, 5)
        self.assertAlmostEqual(excess, 12.5)

    def test_bilinear_sampler_matches_planar_fixture_and_strict_zero_weight_nodata(self):
        grid = GridSpec("analysis", 2, 2, 10, 0, 10)
        values = np.array([[0.0, 10.0], [20.0, 30.0]])
        self.assertAlmostEqual(_bilinear(values, grid, (5, 5)), 15)
        self.assertIsNone(_bilinear(np.array([[0.0, 10.0], [20.0, np.nan]]), grid, (0, 10)))
        self.assertAlmostEqual(_bilinear(values, grid, (10, 0)), 30)

    def test_segment_metrics_on_known_plane(self):
        class Dataset:
            analysis_grid = GridSpec("analysis", 3, 3, 10, 0, 20)
            heights_m = np.array([[0, 10, 20], [20, 30, 40], [40, 50, 60]], dtype=float)
            slope_deg = np.full((3, 3), np.degrees(np.arctan(np.hypot(1, 2))))

        result = analyze_segment(Dataset(), (0, 20), (20, 0), 5, segment_index=0)
        self.assertAlmostEqual(result["lengthM"], np.sqrt(800))
        self.assertAlmostEqual(result["ascentM"], 60)
        self.assertAlmostEqual(result["descentM"], 0)
        self.assertAlmostEqual(result["meanSlopeDeg"], np.degrees(np.arctan(np.hypot(1, 2))))

    def test_invalid_sampling_interval_is_rejected(self):
        with self.assertRaises(RouteTerrainError):
            _validate_interval(0, 10)
    def test_plane_has_known_slope(self):
        y, x = np.mgrid[0:5, 0:5]
        elevation = 2 * x + 3 * y
        expected = np.degrees(np.arctan(np.hypot(2, 3)))
        np.testing.assert_allclose(finite_difference_slope(elevation, 1), expected)

    def test_horn_plane_matches_known_slope(self):
        y, x = np.mgrid[0:7, 0:7]
        elevation = 2 * x + 3 * y
        expected = np.degrees(np.arctan(np.hypot(2, 3)))
        np.testing.assert_allclose(horn_slope(elevation, 1)[1:-1, 1:-1], expected)

    def test_components_distinguish_diagonal_connectivity(self):
        mask = np.eye(3, dtype=bool)
        self.assertEqual(len(connected_components(mask, diagonal=False)), 3)
        self.assertEqual(len(connected_components(mask, diagonal=True)), 1)

    def test_route_cost_is_reproducible_and_penalty_increases(self):
        points = [(0.0, 0.0), (3.0, 4.0), (3.0, 8.0)]
        self.assertEqual(route_length(points), 9.0)
        baseline = baseline_cost(points, 1.0)
        penalized = slope_penalty_cost(points, [10.0, 20.0], 1.0, penalty_per_degree=0.1)
        self.assertGreater(penalized, baseline)

    def test_quality_statistics_and_relief(self):
        values = np.array([[1.0, 2.0], [3.0, np.nan]])
        self.assertEqual(finite_stats(values)["count"], 3)
        np.testing.assert_allclose(local_relief(values, 1), 2.0, equal_nan=False)


if __name__ == "__main__":
    unittest.main()
