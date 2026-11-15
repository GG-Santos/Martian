import { describe, expect, it } from "vitest";
import archive from "../../../public/data/jezero/dust-events.json";
import manifest from "../../../public/data/jezero/manifest.json";
import { parseDustEvents, selectDustScenario } from "./dust-scenario";

const location = {
  locationId: "jezero", ...manifest.center,
  terrain: { ...manifest.grid, values: new Float32Array(257 * 257) },
};

describe("dust events", () => {
  it("preserves dated regional MARCI provenance", () => {
    const event = parseDustEvents(archive).events[0];
    expect(event.sourceRecords[0]).toMatchObject({
      acquisitionRange: ["2022-01-08T11:08:03Z", "2022-01-09T11:26:49Z"],
      productId: expect.stringContaining("2024JE008565"), units: expect.any(String),
    });
    expect(event.frames[0]).toMatchObject({ observed: true, acquisitionSol: "315", centerLon: 63, centerLat: 25 });
    expect(event.frames[0].radiusKm).toBeGreaterThan(1000);
  });

  it.each([
    ["unsafe source URL", (event: typeof archive.events[0]) => { event.sourceRecords[0].url = "javascript:alert(1)"; }],
    ["empty source references", (event: typeof archive.events[0]) => { event.frames[0].sourceRecordIds = []; }],
    ["singleton frames", (event: typeof archive.events[0]) => { event.frames.pop(); }],
    ["overstated seasonal coverage", (event: typeof archive.events[0]) => { event.solarLongitude[1] = 155.1; }],
    ["overstated acquisition coverage", (event: typeof archive.events[0]) => {
      event.acquisitionRange[1] = "2022-01-10T11:45:38Z";
      event.sourceRecords[0].acquisitionRange[1] = event.acquisitionRange[1];
    }],
    ["duplicate frame time", (event: typeof archive.events[0]) => { event.frames[1].elapsedSol = 0; }],
    ["invalid acquisition date", (event: typeof archive.events[0]) => { event.sourceRecords[0].acquisitionRange[0] = "2022-02-31T12:00:00Z"; }],
    ["inverted opacity range", (event: typeof archive.events[0]) => { event.frames[0].opacityRange = [3, 1]; }],
  ])("rejects %s", (_label, mutate) => {
    const invalid = structuredClone(archive);
    mutate(invalid.events[0]);
    expect(() => parseDustEvents(invalid)).toThrow();
  });

  it("replays only a matching historical location and season", () => {
    const catalog = parseDustEvents(archive);
    const result = selectDustScenario(catalog, location, 155, "crew");
    expect(result).toMatchObject({ status: "historical", scenarios: [{ startLs: 154.4 }] });
    expect(selectDustScenario(catalog, { ...location, longitude: 120 }, 155, "crew").status).toBe("modeled");
    expect(selectDustScenario(catalog, { ...location, locationId: "gale" }, 155, "crew").status).toBe("modeled");
    expect(selectDustScenario(catalog, location, 155.031, "crew").status).toBe("modeled");
  });

  it("rejects invalid coordinates, season, or missing local footprint", () => {
    const catalog = parseDustEvents(archive);
    for (const selection of [
      selectDustScenario(catalog, { ...location, latitude: NaN }, 20, "crew"),
      selectDustScenario(catalog, { ...location, terrain: null }, 20, "crew"),
      selectDustScenario(catalog, location, 360, "crew"),
    ]) expect(selection).toEqual({ status: "unavailable", scenarios: [] });
  });
});
