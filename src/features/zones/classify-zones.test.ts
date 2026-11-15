import { describe, expect, it } from "vitest";
import type { Hazard } from "../hazards/hazard-types";
import type { HeightGrid } from "../mission/types";
import { buildZoneGrid, classifyPoint } from "./classify-zones";

const gridForSlope = (riseM: number): HeightGrid => ({
  width: 3,
  height: 3,
  cellSizeM: 8,
  westM: 0,
  northM: 16,
  values: new Float32Array([
    0, riseM, riseM * 2,
    0, riseM, riseM * 2,
    0, riseM, riseM * 2,
  ]),
});
const point = { x: 4, y: 12 };
const riseAt = (degrees: number) => 8 * Math.tan((degrees * Math.PI) / 180);

function scenario(severity: Hazard["severity"], evidence: Hazard["evidence"]): Hazard {
  return {
    id: `sand-${severity}`,
    category: "sand",
    title: "Reviewed sand field",
    severity,
    evidence,
    marker: point,
    geometry: {
      kind: "polygon",
      points: [
        { x: 2, y: 14 },
        { x: 6, y: 14 },
        { x: 6, y: 10 },
        { x: 2, y: 10 },
      ],
    },
    description: "Illustrative sand scenario.",
    risks: ["Difficult footing"],
    precautions: ["Inspect first"],
    sources: ["https://example.org/sand"],
  };
}

describe("zone classification", () => {
  it("classifies a valid slope of 10° or less as illustrative lower mapped slope", () => {
    const zone = classifyPoint(point, gridForSlope(riseAt(10)), []);
    expect(zone.category).toBe("safe");
    expect(zone.label).toBe("Lower mapped slope");
    expect(zone.sourceClass).toBe("Terrain-derived");
    expect(zone.reasons.join(" ")).toMatch(/not.*certif/i);
  });

  it("classifies slopes above 10° through 15° as caution", () => {
    const zone = classifyPoint(point, gridForSlope(riseAt(12)), []);
    expect(zone.category).toBe("caution");
    expect(zone.label).toBe("Difficult terrain");
    expect(classifyPoint(point, gridForSlope(riseAt(15)), []).category).toBe("caution");
  });

  it("classifies slopes above 15° as steep hazard", () => {
    const zone = classifyPoint(point, gridForSlope(riseAt(16)), []);
    expect(zone.category).toBe("hazard");
    expect(zone.label).toBe("Steep slope");
  });

  it("keeps missing and NaN terrain unknown even with a reviewed scenario", () => {
    const missing = gridForSlope(0);
    missing.values[1] = NaN;
    const zone = classifyPoint(point, missing, [scenario("warning", "Reviewed scenario")]);
    expect(zone.category).toBe("unknown");
    expect(zone.label).toBe("Unknown");
    expect(zone.evidence.some((entry) => entry.sourceClass === "Reviewed scenario")).toBe(true);
    expect(zone.reasons.join(" ")).toMatch(/terrain.*unknown/i);
  });

  it("lets a reviewed polygon raise low terrain to caution without changing provenance", () => {
    const zone = classifyPoint(point, gridForSlope(0), [scenario("caution", "Reviewed scenario")]);
    expect(zone.category).toBe("caution");
    expect(zone.sourceClass).toBe("Reviewed scenario");
    expect(zone.evidence).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceClass: "Terrain-derived" }),
      expect.objectContaining({ sourceClass: "Reviewed scenario", hazardId: "sand-caution" }),
    ]));
  });

  it("does not downgrade a steep slope for a lesser overlapping scenario", () => {
    const zone = classifyPoint(point, gridForSlope(riseAt(20)), [scenario("caution", "Reviewed scenario")]);
    expect(zone.category).toBe("hazard");
    expect(zone.sourceClass).toBe("Terrain-derived");
  });

  it("uses an explicitly supplied sector event to raise known terrain", () => {
    const dust = { ...scenario("warning", "Scenario event"), category: "dust" as const, geometry: { kind: "sector" as const } };
    const zone = classifyPoint(point, gridForSlope(0), [dust]);
    expect(zone.category).toBe("hazard");
    expect(zone.sourceClass).toBe("Scenario event");
    expect(classifyPoint(point, gridForSlope(0), []).category).toBe("safe");
  });

  it("keeps out-of-bounds and nonfinite points unknown", () => {
    for (const outside of [{ x: -1, y: 12 }, { x: 4, y: 17 }, { x: NaN, y: 12 }]) {
      expect(classifyPoint(outside, gridForSlope(0), []).category).toBe("unknown");
    }
  });

  it("builds one north-first zone per terrain cell, preserving centers and bounds", () => {
    const zones = buildZoneGrid(gridForSlope(0), []);
    expect(zones.width).toBe(2);
    expect(zones.height).toBe(2);
    expect(zones.cellSizeM).toBe(8);
    expect(zones.cells.map(({ center }) => center)).toEqual([
      { x: 4, y: 12 }, { x: 12, y: 12 }, { x: 4, y: 4 }, { x: 12, y: 4 },
    ]);
    expect(zones.cells.every(({ category }) => category === "safe")).toBe(true);
  });
});
