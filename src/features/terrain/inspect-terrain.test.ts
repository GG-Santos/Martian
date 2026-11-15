import { expect, it } from "vitest";
import { inspectTerrain } from "./inspect-terrain";
import type { HeightGrid } from "../mission/types";
it("reads registered analysis values, preserves missing thermal and ignores display detail", () => {
  const grid: HeightGrid = {
    width: 3,
    height: 3,
    cellSizeM: 8,
    westM: 0,
    northM: 16,
    values: new Float32Array([0, 8, 16, 0, 8, 16, 0, 8, 16]),
  };
  const bytes = new Uint8Array(9);
  bytes[4] = 130;
  const reading = inspectTerrain({ x: 8, y: 8 }, grid, bytes);
  expect(reading.elevationM).toBe(8);
  expect(reading.slopeDeg).toBeCloseTo(45);
  expect(reading.thermalDn).toBe(130);
  expect(inspectTerrain({ x: 0, y: 16 }, grid, bytes).thermalDn).toBeNull();
  expect(inspectTerrain({ x: -1, y: 8 }, grid, bytes).elevationM).toBeNull();
  expect(inspectTerrain({ x: -1, y: 8 }, grid, bytes).thermalDn).toBeNull();
  expect(inspectTerrain({ x: 8, y: 8 }, grid, bytes)).toEqual(reading);
});
