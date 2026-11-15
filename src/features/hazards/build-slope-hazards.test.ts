import { expect, it } from "vitest";
import { buildSlopeHazards } from "./build-slope-hazards";
it("derives stable connected steep cells with clipped coverage", () => {
  const grid = {
    width: 4,
    height: 4,
    cellSizeM: 8,
    westM: 0,
    northM: 24,
    values: Float32Array.from({ length: 16 }, (_, i) => (i % 4) * 8),
  };
  const hazards = buildSlopeHazards(grid);
  expect(hazards).toHaveLength(1);
  expect(hazards[0].geometry.kind).toBe("cells");
  expect(hazards).toEqual(buildSlopeHazards(grid));
  if (hazards[0].geometry.kind === "cells") {
    expect(hazards[0].geometry.cells).toHaveLength(9);
    expect(
      Math.max(...hazards[0].geometry.cells.map((c) => c.westM + c.sizeM)),
    ).toBe(24);
  }
  expect(buildSlopeHazards({ ...grid, values: new Float32Array(16) })).toEqual(
    [],
  );
  const bands = [0, 0, 8, 8, 8, 0, 0];
  const disjoint = {
    ...grid,
    width: 7,
    values: Float32Array.from({ length: 28 }, (_, i) => bands[i % 7]),
  };
  expect(buildSlopeHazards(disjoint)).toHaveLength(2);
});
