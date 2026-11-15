import { it, expect } from "vitest";
import {
  createRouteState,
  applyRouteAction,
  resolveNodes,
} from "./route-state";
import type { HeightGrid, RouteNode } from "../mission/types";
const grid: HeightGrid = {
  width: 21,
  height: 21,
  cellSizeM: 10,
  westM: 0,
  northM: 200,
  values: new Float32Array(441),
};
const nodes: RouteNode[] = [
  { id: "start", kind: "start", point: { x: 10, y: 10 } },
  { id: "A", kind: "stop", stopId: "A", point: { x: 50, y: 40 } },
  { id: "B", kind: "stop", stopId: "B", point: { x: 100, y: 60 } },
  { id: "C", kind: "stop", stopId: "C", point: { x: 150, y: 100 } },
  { id: "end", kind: "end", point: { x: 10, y: 10 } },
];
it("keeps fixed anchors and rejects edits without mutating previous state", () => {
  const state = createRouteState(nodes);
  const before = JSON.stringify(state);
  for (const action of [
    { type: "move" as const, id: "A", point: { x: 1, y: 2 } },
    { type: "remove" as const, id: "start" },
    { type: "reorder" as const, id: "B", direction: 1 as const },
    {
      type: "insert" as const,
      afterNodeId: "start",
      id: "bad",
      point: { x: 300, y: 20 },
    },
  ])
    expect(applyRouteAction(state, action, grid).ok).toBe(false);
  expect(JSON.stringify(state)).toBe(before);
});
it("toggles only membership and restores all defaults on reset", () => {
  const state = createRouteState(nodes);
  const r = applyRouteAction(
    state,
    { type: "set-stop-included", stopId: "B", included: false },
    grid,
  );
  expect(r.ok).toBe(true);
  if (!r.ok) return;
  expect(resolveNodes(r.value).map((n) => n.id)).toEqual([
    "start",
    "A",
    "C",
    "end",
  ]);
  expect(r.value.nodes).toEqual(nodes);
  const reset = applyRouteAction(r.value, { type: "reset" }, grid);
  expect(reset.ok).toBe(true);
  if (reset.ok) expect(reset.value).toEqual(state);
});
it("limits only intermediate waypoints to twelve", () => {
  let state = createRouteState(nodes);
  for (let i = 0; i < 12; i++) {
    const r = applyRouteAction(
      state,
      {
        type: "insert",
        afterNodeId: "start",
        id: "w" + i,
        point: { x: 20 + i, y: 20 },
      },
      grid,
    );
    expect(r.ok).toBe(true);
    if (r.ok) state = r.value;
  }
  expect(
    applyRouteAction(
      state,
      {
        type: "insert",
        afterNodeId: "start",
        id: "last",
        point: { x: 30, y: 30 },
      },
      grid,
    ).ok,
  ).toBe(false);
});
it("rejects a newly connected no-data segment when a stop is excluded", () => {
  const custom: RouteNode[] = [
    nodes[0],
    { ...nodes[1], point: { x: 10, y: 180 } },
    nodes[4],
  ];
  const g = { ...grid, values: new Float32Array(grid.values) };
  g.values[10 * 21 + 5] = NaN;
  // Dedicated dogleg: direct start→C crosses the gap, A avoids it.
  custom[2] = { ...nodes[3], point: { x: 190, y: 10 } };
  custom.push({ ...nodes[4], point: { x: 190, y: 10 } });
  g.values[19 * 21 + 10] = NaN;
  expect(
    applyRouteAction(
      createRouteState(custom),
      { type: "set-stop-included", stopId: "A", included: false },
      g,
    ).ok,
  ).toBe(false);
});

it("retains prior state after overflowing assumption estimates", () => {
  const state = createRouteState(nodes),
    before = JSON.stringify(state);
  expect(
    applyRouteAction(
      state,
      {
        type: "set-assumptions",
        assumptions: { speedMps: 1e-320, allowanceMin: 120, dwellMin: 10 },
      },
      grid,
    ).ok,
  ).toBe(false);
  expect(JSON.stringify(state)).toBe(before);
});
