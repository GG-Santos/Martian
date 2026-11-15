import type { Hazard } from "../hazards/hazard-types";
import { pointInHazard } from "../hazards/hazard-geometry.ts";
import type { HeightGrid, LocalPoint } from "../mission/types";
import { sampleSlopeDeg } from "../terrain/spatial.ts";
import type { ZoneAssessment, ZoneCategory, ZoneEvidence, ZoneGrid } from "./zone-types";

// Illustrative map screening bands, not EVA safety limits. The existing slope
// palette marks 10° and its route caution threshold is above 15°.
export const ZONE_SLOPE_BANDS_DEG = { lowerMax: 10, cautionMax: 15 } as const;
const ROUNDING_TOLERANCE_DEG = 1e-5;
const TERRAIN_SOURCE = "https://hirise.lpl.arizona.edu/dtm/ESP_048842_1985";

export function classifyPoint(point: LocalPoint, grid: HeightGrid, hazards: Hazard[]): ZoneAssessment {
  const slopeDeg = sampleSlopeDeg(grid, point);
  const inBounds =
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    point.x >= grid.westM &&
    point.x <= grid.westM + (grid.width - 1) * grid.cellSizeM &&
    point.y <= grid.northM &&
    point.y >= grid.northM - (grid.height - 1) * grid.cellSizeM;
  const overlapping = inBounds
    ? hazards.filter((hazard) =>
        hazard.geometry.kind === "sector" || pointInHazard(point, hazard),
      )
    : [];
  const evidence: ZoneEvidence[] = [];
  if (slopeDeg !== null && Number.isFinite(slopeDeg)) {
    evidence.push({
      sourceClass: "Terrain-derived",
      label: `Slope derived from archived HiRISE elevation at ${grid.cellSizeM} m analysis spacing`,
      sources: [TERRAIN_SOURCE],
    });
  }
  evidence.push(...overlapping.map((hazard) => ({
    sourceClass: hazard.evidence,
    label: hazard.title,
    hazardId: hazard.id,
    sources: hazard.sources,
  })));

  if (slopeDeg === null || !Number.isFinite(slopeDeg)) {
    return {
      category: "unknown",
      label: "Unknown",
      slopeDeg: null,
      sourceClass: "Unknown",
      evidence,
      reasons: [
        inBounds
          ? "Terrain elevation or slope is unknown at this point; scenario overlap does not certify the terrain."
          : "Point is outside the mapped terrain bounds or has invalid coordinates.",
        ...overlapping.map((hazard) => `${hazard.title}: ${hazard.evidence.toLowerCase()} (${hazard.severity}).`),
      ],
    };
  }

  let category: ZoneCategory;
  let label: string;
  let sourceClass: ZoneAssessment["sourceClass"] = "Terrain-derived";
  let reason: string;
  if (slopeDeg > ZONE_SLOPE_BANDS_DEG.cautionMax + ROUNDING_TOLERANCE_DEG) {
    category = "hazard";
    label = "Steep slope";
    reason = "Derived slope exceeds the illustrative 15° steep-terrain threshold.";
  } else if (slopeDeg > ZONE_SLOPE_BANDS_DEG.lowerMax + ROUNDING_TOLERANCE_DEG) {
    category = "caution";
    label = "Difficult terrain";
    reason = "Derived slope exceeds 10° and is at most 15° under the illustrative screening policy.";
  } else {
    category = "safe";
    label = "Lower mapped slope";
    reason = "Derived slope is at most 10°; this illustrative Safe Zone screening class is not EVA certified.";
  }

  const reasons = [reason];
  for (const hazard of overlapping) {
    reasons.push(`${hazard.title}: ${hazard.evidence.toLowerCase()} (${hazard.severity}); ${hazard.description}`);
    const raised = hazard.severity === "warning" ? "hazard" : "caution";
    if ((category === "safe") || (category === "caution" && raised === "hazard")) {
      category = raised;
      label = hazard.title;
      sourceClass = hazard.evidence;
    }
  }
  return { category, label, slopeDeg, evidence, reasons, sourceClass };
}

export function buildZoneGrid(grid: HeightGrid, hazards: Hazard[]): ZoneGrid {
  const width = Math.max(0, grid.width - 1);
  const height = Math.max(0, grid.height - 1);
  const cells: ZoneGrid["cells"] = [];
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const center = {
        x: grid.westM + (col + 0.5) * grid.cellSizeM,
        y: grid.northM - (row + 0.5) * grid.cellSizeM,
      };
      cells.push({ row, col, center, ...classifyPoint(center, grid, hazards) });
    }
  }
  return {
    width,
    height,
    cellSizeM: grid.cellSizeM,
    westM: grid.westM,
    northM: grid.northM,
    cells,
  };
}
