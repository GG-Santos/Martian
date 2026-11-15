import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { sampleHeight, sampleSlopeDeg, toScene, fromScene } from "./spatial";
const grid = {
  width: 2,
  height: 2,
  cellSizeM: 10,
  westM: 0,
  northM: 10,
  values: new Float32Array([0, 10, 20, 30]),
};
describe("registered spatial sampling", () => {
  it("matches the shared Python parity fixture", () => {
    const fixture = JSON.parse(
      readFileSync("analysis/tests/fixtures/route_parity_fixture.json", "utf8"),
    ) as {
      grid: { width: number; height: number; cellSizeM: number; westM: number; northM: number; values: number[] };
      point: { x: number; y: number };
      expected: { elevationM: number; slopeDeg: number };
    };
    const grid = { ...fixture.grid, values: new Float32Array(fixture.grid.values) };
    expect(sampleHeight(grid, fixture.point)).toBeCloseTo(fixture.expected.elevationM, 6);
    expect(sampleSlopeDeg(grid, fixture.point)).toBeCloseTo(fixture.expected.slopeDeg, 5);
  });

  it("samples north-first elevations in meters", () => {
    expect(sampleHeight(grid, { x: 5, y: 5 })).toBe(15);
    expect(sampleHeight(grid, { x: -1, y: 5 })).toBeNull();
    expect(
      sampleHeight(
        { ...grid, values: new Float32Array([0, NaN, 20, 30]) },
        { x: 5, y: 5 },
      ),
    ).toBeNull();
  });
  it("uses the full terrain gradient", () => {
    expect(
      sampleSlopeDeg(
        { ...grid, values: new Float32Array(4).fill(10) },
        { x: 5, y: 5 },
      ),
    ).toBe(0);
    expect(sampleSlopeDeg(grid, { x: 5, y: 5 })).toBeCloseTo(65.905, 2);
  });
  it("roundtrips corners and center without flipping north", () => {
    for (const point of [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
      { x: 10, y: 10 },
      { x: 5, y: 5 },
    ]) {
      const p = toScene(point, 123, grid);
      expect(fromScene(p[0], p[2], grid)).toEqual(point);
    }
    expect(toScene({ x: 0, y: 10 }, 0, grid)[2]).toBe(-5);
  });
});
