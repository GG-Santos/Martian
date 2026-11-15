import { describe, expect, it } from "vitest";
import archive from "../../../public/data/jezero/dust-events.json";
import manifestData from "../../../public/data/jezero/manifest.json";
import { validateManifest } from "../mission/load-mission";
import { advanceDustScenario, parseDustEvents, projectDustFrame, selectDustScenario } from "./dust-scenario";

const manifest = validateManifest(manifestData);
const site = { locationId: "jezero", ...manifest.center, terrain: { ...manifest.grid, values: new Float32Array(257 * 257) } };
const catalog = () => parseDustEvents(archive);

describe("dust simulation", () => {
  it("replays recorded samples and marks interpolated frames as unobserved", () => {
    const [scenario] = selectDustScenario(catalog(), site, 155, "crew").scenarios;
    const duration = scenario.frames.at(-1)!.elapsedSol;
    expect(advanceDustScenario(scenario, 0)).toMatchObject({ observed: true, acquisitionSol: "315" });
    expect(advanceDustScenario(scenario, duration / 2)).toMatchObject({ observed: false, acquisitionSol: null });
    expect(advanceDustScenario(scenario, duration)).toMatchObject({ observed: true, acquisitionSol: "316" });
    expect(advanceDustScenario(scenario, duration + 1)).toBeNull();
  });

  it("generates repeatable, distinct low, central and high tracks with traceable model inputs", () => {
    const selection = selectDustScenario(catalog(), site, 250, "crew-a");
    expect(selection).toEqual(selectDustScenario(catalog(), site, 250, "crew-a"));
    expect(selection.scenarios[0].frames).not.toEqual(selectDustScenario(catalog(), site, 250, "crew-b").scenarios[0].frames);
    expect(selection.scenarios[0].frames).not.toEqual(selectDustScenario(catalog(), site, 251, "crew-a").scenarios[0].frames);
    expect(selection.scenarios).toHaveLength(3);
    const [low, central, high] = selection.scenarios.map((scenario) => {
      expect(scenario.frames[0]).toMatchObject({ observed: false, acquisitionSol: null, seed: "crew-a", modelVersion: expect.any(String) });
      return scenario.frames[1].opacityRange[1];
    });
    expect(low).toBeLessThan(central);
    expect(central).toBeLessThan(high);
  });

  it("clips local polygons, treats historical context as sector-wide, and drops nonoverlapping frames", () => {
    const [scenario] = selectDustScenario(catalog(), site, 250, "crew-a").scenarios;
    const frame = scenario.frames[1];
    const hazard = projectDustFrame(frame, manifest);
    expect(hazard).toMatchObject({ category: "dust", evidence: "Scenario event", geometry: { kind: "polygon" } });
    if (hazard?.geometry.kind !== "polygon") throw new Error("Expected local polygon");
    for (const point of hazard.geometry.points) {
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(2048);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(2048);
    }
    expect(projectDustFrame({ ...frame, centerLon: 120 }, manifest)).toBeNull();
    expect(projectDustFrame(catalog().events[0].frames[0], manifest)?.geometry.kind).toBe("sector");
  });
});
