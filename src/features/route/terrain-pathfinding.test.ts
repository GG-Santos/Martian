import { describe, expect, it } from "vitest";
import { pointInHazard } from "../hazards/hazard-geometry";
import type { Hazard } from "../hazards/hazard-types";
import type { HeightGrid, LocalPoint } from "../mission/types";
import { findTerrainAwareLeg, findTerrainAwarePath } from "./terrain-pathfinding";

function flatGrid(): HeightGrid {
  return {
    width: 15,
    height: 11,
    cellSizeM: 8,
    westM: 0,
    northM: 80,
    values: new Float32Array(15 * 11),
  };
}

const hazard: Hazard = {
  id: "crew-dust",
  category: "dust",
  scenarioKind: "dust",
  title: "Dust scenario",
  severity: "warning",
  evidence: "Scenario event",
  marker: { x: 52, y: 40 },
  geometry: {
    kind: "polygon",
    points: [
      { x: 36, y: 8 }, { x: 68, y: 8 },
      { x: 68, y: 72 }, { x: 36, y: 72 },
    ],
  },
  description: "Seeded test zone.",
  risks: ["Reduced visibility"],
  precautions: ["Review the scenario"],
  sources: ["Crew-seeded simulation"],
};

function segmentSamples(a: LocalPoint, b: LocalPoint): LocalPoint[] {
  const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2);
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  });
}

describe("findTerrainAwarePath", () => {
  it("routes around the active crew hazard and returns to the habitat", () => {
    const base = { x: 8, y: 40 };
    const objective = { x: 104, y: 40 };
    const path = findTerrainAwarePath(flatGrid(), base, objective, [hazard]);

    expect(path).not.toBeNull();
    expect(path?.[0]).toEqual(base);
    expect(path?.at(-1)).toEqual(base);
    expect(path?.some((point) => Math.abs(point.x - objective.x) < 1e-6 && Math.abs(point.y - objective.y) < 1e-6)).toBe(true);
    const samples = path!.slice(1).flatMap((point, index) => segmentSamples(path![index], point));
    expect(samples.some((point) => pointInHazard(point, hazard))).toBe(false);
    expect(path!.length).toBeGreaterThan(3);
  });

  it("returns no path when terrain samples are missing", () => {
    const grid = flatGrid();
    grid.values.fill(Number.NaN);
    expect(findTerrainAwarePath(grid, { x: 8, y: 40 }, { x: 104, y: 40 }, [])).toBeNull();
  });

  it("prefers a mapped low-slope corridor over a steep ridge", () => {
    const grid = flatGrid();
    for (let y = 3; y <= 7; y++) grid.values[y * grid.width + 7] = 100;
    const path = findTerrainAwarePath(grid, { x: 8, y: 40 }, { x: 104, y: 40 }, []);

    expect(path).not.toBeNull();
    expect(path!.some((point) => point.y !== 40)).toBe(true);
    expect(path?.[0]).toEqual({ x: 8, y: 40 });
    expect(path?.at(-1)).toEqual({ x: 8, y: 40 });
  });

  it("refuses endpoints outside the mapped grid", () => {
    expect(findTerrainAwarePath(flatGrid(), { x: -1, y: 40 }, { x: 104, y: 40 }, [])).toBeNull();
  });
});

it("keeps the objective when returning the one-way leg and detours more for lower exposure", () => {
  const grid: HeightGrid = { ...flatGrid(), cellSizeM: 2, northM: 20 };
  const start = { x: 2, y: 10 };
  const goal = { x: 26, y: 10 };
  // A tiny warning at the center of the direct shortcut is avoidable on flat terrain.
  const smallHazard: Hazard = { ...hazard, marker: { x: 14, y: 10 }, geometry: {
    kind: "polygon", points: [{ x: 13.5, y: 9.5 }, { x: 14.5, y: 9.5 }, { x: 14.5, y: 10.5 }, { x: 13.5, y: 10.5 }],
  } };
  const efficient = findTerrainAwareLeg(grid, start, goal, [smallHazard], "efficient")!;
  const lower = findTerrainAwareLeg(grid, start, goal, [smallHazard], "lower-exposure")!;
  expect(efficient).toEqual([start, goal]);
  expect(lower[0]).toEqual(start);
  expect(lower.at(-1)).toEqual(goal);
  expect(lower.slice(1).flatMap((point, i) => segmentSamples(lower[i], point)).some((point) => pointInHazard(point, smallHazard))).toBe(false);
  expect(lower.length).toBeGreaterThan(2);
});
