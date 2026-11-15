import { it, expect, vi } from "vitest";
import { calculateRoute, isCaution } from "./calculate-route";
import type { HeightGrid, RouteNode } from "../mission/types";
const grid: HeightGrid = {
  width: 11,
  height: 3,
  cellSizeM: 10,
  westM: 0,
  northM: 20,
  values: new Float32Array(33),
};
const assumptions = { speedMps: 0.5, allowanceMin: 120, dwellMin: 10 };
const nodes: RouteNode[] = [
  { id: "s", kind: "start", point: { x: 0, y: 10 } },
  ...[25, 50, 100].map((x, i) => ({
    id: String(i),
    kind: "stop" as const,
    stopId: (["A", "B", "C"] as const)[i],
    point: { x, y: 10 },
  })),
  { id: "e", kind: "end", point: { x: 0, y: 10 } },
];
it("includes return distance and one dwell per stop", () => {
  const r = calculateRoute(grid, nodes, assumptions);
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(r.value.distanceM).toBeCloseTo(200);
  expect(r.value.ascentM).toBe(0);
  expect(r.value.durationMin).toBeCloseTo(36.6667, 3);
  expect(r.value.remainingMin).toBeCloseTo(83.3333, 3);
  expect(r.value.samples.at(-1)?.x).toBe(0);
});
it("counts positive ascent on the whole loop", () => {
  const g = {
    ...grid,
    values: new Float32Array(Array.from({ length: 33 }, (_, i) => i % 11)),
  };
  const r = calculateRoute(g, nodes, assumptions);
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.value.ascentM).toBeCloseTo(10);
});
it("rejects nonfinite inputs and invalid assumptions", () => {
  for (const a of [
    { ...assumptions, speedMps: 0 },
    { ...assumptions, speedMps: -1 },
    { ...assumptions, speedMps: NaN },
    { ...assumptions, allowanceMin: 0 },
    { ...assumptions, dwellMin: -1 },
    { ...assumptions, allowanceMin: Infinity },
  ])
    expect(calculateRoute(grid, nodes, a).ok).toBe(false);
  expect(
    calculateRoute(
      grid,
      [...nodes, { id: "bad", kind: "waypoint", point: { x: NaN, y: 0 } }],
      assumptions,
    ).ok,
  ).toBe(false);
});
it("rejects interior missing coverage and outside terrain", () => {
  const g = { ...grid, values: new Float32Array(grid.values) };
  g.values[16] = NaN;
  expect(calculateRoute(g, nodes, assumptions).ok).toBe(false);
  expect(
    calculateRoute(
      grid,
      [nodes[0], { ...nodes[4], point: { x: 120, y: 10 } }],
      assumptions,
    ).ok,
  ).toBe(false);
});
it("retains negative time allowance and tests full gradient caution", () => {
  const g = {
    ...grid,
    values: new Float32Array(
      Array.from(
        { length: 33 },
        (_, i) => Math.floor(i / 11) * 10 * Math.tan((20 * Math.PI) / 180),
      ),
    ),
  };
  const r = calculateRoute(g, nodes, { ...assumptions, allowanceMin: 1 });
  expect(r.ok).toBe(true);
  if (r.ok) {
    expect(r.value.remainingMin).toBeLessThan(0);
    expect(r.value.samples.every((s) => isCaution(s.slopeDeg))).toBe(true);
  }
  expect(isCaution(15)).toBe(false);
  expect(isCaution(16)).toBe(true);
});

it("rejects huge finite coordinates before allocating route samples", () => {
  // Fail fast instead of hanging the test runner if subdivision starts too early.
  const guard = vi.spyOn(Math, "ceil").mockImplementation(() => {
    throw new Error("Invalid route reached subdivision");
  });
  try {
    const result = calculateRoute(
      grid,
      [nodes[0], { ...nodes[1], point: { x: 1e308, y: 10 } }],
      assumptions,
    );
    expect(result.ok).toBe(false);
  } finally {
    guard.mockRestore();
  }
});
it("rejects overflow from finite speed or dwell values", () => {
  expect(
    calculateRoute(grid, nodes, { ...assumptions, speedMps: 1e-320 }).ok,
  ).toBe(false);
  expect(
    calculateRoute(grid, nodes, { ...assumptions, dwellMin: 1e308 }).ok,
  ).toBe(false);
});
