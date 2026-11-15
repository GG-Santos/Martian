import { describe, expect, it } from "vitest";
import {
  surfaceRasterPixels,
  sampleSurfaceRaster,
  slopeStops,
} from "./surface-raster";
import type { HeightGrid } from "../mission/types";

const grid: HeightGrid = {
  width: 2,
  height: 2,
  cellSizeM: 8,
  westM: 0,
  northM: 8,
  values: new Float32Array([1, 2, 3, 4]),
};

describe("scanner surface rasters", () => {
  it("uses the packaged quarter-degree slope encoding and preserves no-data", () => {
    const pixels = surfaceRasterPixels(
      grid,
      "slope",
      { slope: new Uint8Array([0, 40, 60, 255]) },
      [0, 1],
    );
    expect([...pixels.slice(0, 4)]).toEqual([...slopeStops[0].rgb, 255]);
    expect([...pixels.slice(4, 8)]).toEqual([...slopeStops[1].rgb, 255]);
    expect([...pixels.slice(8, 12)]).toEqual([...slopeStops[2].rgb, 255]);
    expect([...pixels.slice(12, 16)]).toEqual([0, 0, 0, 0]);
  });
  it("reads the same raster cell shown on the north-up map", () => {
    const data = { slope: new Uint8Array([0, 40, 60, 255]) };
    expect(sampleSurfaceRaster(grid, { x: 8, y: 8 }, "slope", data)).toBe(10);
    expect(sampleSurfaceRaster(grid, { x: 8, y: 0 }, "slope", data)).toBeNull();
    expect(
      sampleSurfaceRaster(grid, { x: -1, y: 8 }, "slope", data),
    ).toBeNull();
  });
  it("rejects a missing or misregistered scalar array", () => {
    expect(() => surfaceRasterPixels(grid, "slope", {}, [0, 1])).toThrow(
      /unavailable/,
    );
    expect(() =>
      surfaceRasterPixels(grid, "slope", { slope: new Uint8Array(3) }, [0, 1]),
    ).toThrow(/size/);
  });
  it("masks zero thermal DN and gives a constant elevation grid a finite color", () => {
    expect([
      ...surfaceRasterPixels(
        grid,
        "thermal",
        { thermal: new Uint8Array([0, 100, 100, 100]) },
        [96, 164],
      ).slice(0, 4),
    ]).toEqual([0, 0, 0, 0]);
    const pixels = surfaceRasterPixels(
      { ...grid, values: new Float32Array([5, 5, 5, 5]) },
      "topographic",
      {},
      [5, 5],
    );
    expect(pixels[3]).toBe(255);
  });
});
