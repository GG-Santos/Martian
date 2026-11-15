import { describe, expect, it } from "vitest";
import { createCrewBaseScenario } from "./crew-hazard-scenario";

describe("crew base scenario", () => {
  it("keeps the Jezero crew hazard layout stable across mission dataset aliases", () => {
    const byRegion = createCrewBaseScenario("crew-a", "jezero");
    const byDataset = createCrewBaseScenario("crew-a", "jezero-hirise-048842-048908-v1");
    expect(byDataset.zones).toEqual(byRegion.zones);
  });

  it("suggests circular areas only over lower mapped-slope cells when slope data is available", () => {
    const width = 257;
    const slope = new Uint8Array(width * width);
    for (let row = 0; row < width; row++) {
      for (let col = 128; col < width; col++) slope[row * width + col] = 80;
    }

    const scenario = createCrewBaseScenario("crew-a", "jezero", {
      width,
      height: width,
      cellSizeM: 8,
      westM: 0,
      northM: 2048,
      values: slope,
    });

    expect(scenario.terrainScreened).toBe(true);
    expect(scenario.recommendedAreas).toHaveLength(3);
    for (const area of scenario.recommendedAreas) {
      expect(area.radiusM).toBeGreaterThan(0);
      expect(area.point.x).toBeLessThan(1024);
      const col = Math.round(area.point.x / 8);
      const row = Math.round((2048 - area.point.y) / 8);
      expect(slope[row * width + col] * 0.25).toBeLessThanOrEqual(10);
    }
  });
});
