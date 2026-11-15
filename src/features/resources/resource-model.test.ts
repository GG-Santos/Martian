import { expect, it } from "vitest";
import type { Hazard } from "../hazards/hazard-types";
import type { HeightGrid, RouteNode } from "../mission/types";
import { estimateRoute } from "./resource-model";

const grid: HeightGrid = { width: 21, height: 5, cellSizeM: 10, westM: 0, northM: 40, values: new Float32Array(105) };
const nodes: RouteNode[] = [
  { id: "s", kind: "start", point: { x: 0, y: 20 } },
  { id: "g", kind: "waypoint", point: { x: 50, y: 20 } },
  { id: "e", kind: "end", point: { x: 0, y: 20 } },
];
const crew = [
  { id: "a", oxygen: 100, stamina: 100, equipment: ["filter"] },
  { id: "b", oxygen: 5, stamina: 100, equipment: [] },
];
const hazard: Hazard = {
  id: "dust", category: "dust", title: "Dust", severity: "warning", evidence: "Scenario event",
  marker: { x: 50, y: 20 }, geometry: { kind: "polygon", points: [{ x: 40, y: 15 }, { x: 60, y: 15 }, { x: 60, y: 25 }, { x: 40, y: 25 }] },
  description: "", risks: [""], precautions: [""], sources: ["https://example.com"],
};

it("uses the least capable member's oxygen and includes a return reserve", () => {
  const result = estimateRoute(nodes, grid, [], crew);
  expect(result.feasible).toBe(false);
  expect(result.limitingMemberId).toBe("b");
  expect(result.perMember[1].oxygenRemaining).toBeLessThan(0);
  expect(result.returnMarginM).toBe(0);
});

it("requires equipment for exposed crew and charges hazard exposure", () => {
  const result = estimateRoute(nodes, grid, [hazard], crew);
  expect(result.exposureHazardIds).toEqual(["dust"]);
  expect(result.perMember[0].oxygenCost).toBeGreaterThan(estimateRoute(nodes, grid, [], crew).perMember[0].oxygenCost);
  expect(result.reasons.join(" ")).toMatch(/b.*filter/i);
});

it("rejects terrain gaps as infeasible", () => {
  const missing = { ...grid, values: new Float32Array(grid.values) };
  missing.values[2 * 21 + 5] = NaN;
  expect(estimateRoute(nodes, missing, [], crew).feasible).toBe(false);
});
