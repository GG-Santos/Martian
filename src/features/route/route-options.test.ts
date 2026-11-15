import { expect, it } from "vitest";
import type { HeightGrid } from "../mission/types";
import { proposeRoutes } from "./route-options";

const grid: HeightGrid = { width: 21, height: 11, cellSizeM: 10, westM: 0, northM: 100, values: new Float32Array(231) };
const start = { x: 10, y: 50 }, goal = { x: 100, y: 50 }, base = start;

it("offers distinct ranked routes with feasibility and explanations", () => {
  const routes = proposeRoutes(start, goal, base, grid, [], [{ id: "a", oxygen: 100, stamina: 100, equipment: [] }]);
  expect(routes.length).toBeGreaterThanOrEqual(2);
  expect(routes[0].nodes).not.toEqual(routes[1].nodes);
  expect(routes[0].feasible).toBe(true);
  expect(routes[0].reason.length).toBeGreaterThan(0);
  expect(routes[0].estimate.distanceM).toBeLessThanOrEqual(routes[1].estimate.distanceM);
});

it("retains but disables options beyond the weakest crew budget", () => {
  const routes = proposeRoutes(start, goal, base, grid, [], [{ id: "a", oxygen: 1, stamina: 1, equipment: [] }]);
  expect(routes.length).toBeGreaterThan(0);
  expect(routes.every((route) => !route.feasible)).toBe(true);
  expect(routes[0].reason).toMatch(/oxygen|stamina/i);
});
