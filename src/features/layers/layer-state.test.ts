import { it, expect } from "vitest";
import { initialLayers, selectAnalysis, updateOptical } from "./layer-state";

it("normalizes optical opacity without changing the active analysis", () => {
  const state = selectAnalysis(initialLayers, "thermal");
  const updated = updateOptical(state, { opacity: 0.4, visible: true });
  expect(updated.optical).toEqual({ opacity: 0.4, visible: true });
  expect(updated.analysis).toBe("thermal");
  expect(updateOptical(updated, { opacity: 2 }).optical.opacity).toBe(1);
  expect(updateOptical(updated, { opacity: -1 }).optical.opacity).toBe(0);
  expect(updateOptical(updated, { opacity: NaN }).optical.opacity).toBe(0.4);
});
