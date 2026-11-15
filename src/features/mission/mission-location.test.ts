import { describe, expect, it } from "vitest";
import * as locations from "./mission-location";

const coverageCases = [
  ["jezero", "jezero", "route-grade", "jezero-hirise-048842-048908-v1", true],
  ["jezero-hirise-048842-048908-v1", "jezero", "route-grade", "jezero-hirise-048842-048908-v1", true],
  ["gale", "gale", "limited", null, false],
  ["valles", "valles", "limited", null, false],
  ["unknown", "unselected", "limited", null, false],
  [null, "unselected", "limited", null, false],
] as const;

describe("boardLocation", () => {
  it.each(coverageCases)("resolves terrain coverage for %s", (id, regionId, kind, datasetId) => {
    expect(locations.boardLocation(id)).toMatchObject({
      regionId,
      coverage: { kind, datasetId, reason: expect.stringMatching(/\S/) },
    });
  });

  it.each(coverageCases)("allows observed terrain for %s only when registered", (id, _region, _kind, _dataset, allowed) => {
    expect(locations.canUseObservedTerrain(locations.boardLocation(id))).toBe(allowed);
  });
});
