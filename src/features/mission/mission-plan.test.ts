import { describe, expect, it } from "vitest";
import { buildRoundTripOptions } from "./mission-plan";
import type { HeightGrid } from "./types";

const base = { x: 8, y: 24 };
const primary = { id: "primary", point: { x: 48, y: 24 } };
const first = { id: "first", point: { x: 48, y: 48 } };
const second = { id: "second", point: { x: 16, y: 48 } };
const flatGrid = (): HeightGrid => ({ width: 10, height: 10, westM: 0, northM: 72, cellSizeM: 8, values: new Float32Array(100) });

describe("buildRoundTripOptions", () => {
  it.each([
    [[first, second], ["primary", "first", "second"]],
    [[second, first], ["primary", "second", "first"]],
    [[], ["primary"]],
  ])("returns both profiles with each objective in visit order and base at both ends", (optional, order) => {
    const options = buildRoundTripOptions(flatGrid(), base, primary, optional, []);
    expect(options.map(({ id }) => id)).toEqual(["efficient", "lower-exposure"]);
    for (const route of options) {
      expect(route.objectiveIds).toEqual(order);
      expect(route.nodes[0]).toMatchObject({ point: base, kind: "start" });
      expect(route.nodes.at(-1)).toMatchObject({ point: base, kind: "end" });
      expect(route.nodes.filter(({ kind }) => kind === "stop").map(({ id, point }) => ({ id, point }))).toEqual([primary, ...optional]);
      expect(route.nodes.slice(1).some(({ point }, i) => point.x === route.nodes[i].point.x && point.y === route.nodes[i].point.y)).toBe(false);
    }
  });

  it("omits options with an out of bounds optional objective", () => {
    expect(buildRoundTripOptions(flatGrid(), base, primary, [{ id: "outside", point: { x: 73, y: 24 } }], [])).toEqual([]);
  });

  it("does not draw a straight line across missing terrain", () => {
    const grid = flatGrid();
    for (let row = 0; row < grid.height; row++) grid.values[row * grid.width + 4] = NaN;
    expect(buildRoundTripOptions(grid, base, primary, [], [])).toEqual([]);
  });
});
