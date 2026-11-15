import { describe, expect, it } from "vitest";
import type { HeightGrid } from "../mission/types";
import { buildCrewRouteCandidate } from "./crew-route";

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

describe("buildCrewRouteCandidate", () => {
  it("connects the selected objective to the selected base and calculates a return", () => {
    const base = { x: 8, y: 40 };
    const objective = { x: 104, y: 40 };
    const candidate = buildCrewRouteCandidate(flatGrid(), base, objective, []);

    expect(candidate).not.toBeNull();
    expect(candidate!.nodes[0]).toMatchObject({ kind: "start", point: base });
    expect(candidate!.nodes.at(-1)).toMatchObject({ kind: "start", point: base });
    expect(candidate!.nodes).toContainEqual(expect.objectContaining({ kind: "waypoint", point: objective }));
    expect(candidate!.summary.distanceM).toBeCloseTo(192);
  });

  it("does not substitute a direct route when no terrain path exists", () => {
    const grid = flatGrid();
    grid.values.fill(Number.NaN);
    expect(buildCrewRouteCandidate(grid, { x: 8, y: 40 }, { x: 104, y: 40 }, [])).toBeNull();
  });
});
