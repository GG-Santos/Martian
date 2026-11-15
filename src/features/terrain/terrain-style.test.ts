import { expect, it } from "vitest";
import { getColorStops, scalarValue } from "./terrain-style";
import { selectAnalysis, initialLayers } from "../layers/layer-state";
import type { Manifest } from "../mission/types";

const manifest = {
  elevationRangeM: [-2650, -2550],
  thermalDnRange: [80, 120],
} as Manifest;
it("uses the active render grid's extrema for elevation colors", () => {
  expect(
    getColorStops("elevation", manifest, [-2651, -2547]).map((s) => s.value),
  ).toEqual([-2651, -2599, -2547]);
});
it("defines shared legend stops in physical units", () => {
  expect(getColorStops("slope", manifest).map((s) => s.value)).toEqual([
    0, 10, 15, 30,
  ]);
  expect(getColorStops("elevation", manifest).map((s) => s.value)).toEqual([
    -2650, -2600, -2550,
  ]);
  expect(getColorStops("thermal", manifest).map((s) => s.value)).toEqual([
    80, 100, 120,
  ]);
  expect(scalarValue("thermal", 0)).toBeNull();
  expect(scalarValue("slope", 255)).toBeNull();
  expect(scalarValue("slope", 60)).toBe(15);
});
it("changes analytical layers independently of optical imagery", () => {
  const state = selectAnalysis(
    selectAnalysis(initialLayers, "slope"),
    "thermal",
  );
  expect(state.analysis).toBe("thermal");
  expect(state.optical).toEqual(initialLayers.optical);
});
