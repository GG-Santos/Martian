import type { LocalPoint } from "../mission/types";
import type { ScenarioHazardKind } from "../hazards/hazard-types";
import { ZONE_SLOPE_BANDS_DEG } from "../zones/classify-zones.ts";

export type CrewSimulatedHazardKind = ScenarioHazardKind;
export type CrewHazardKind = CrewSimulatedHazardKind | "slope";
export type CrewHazardZone = { id: string; kind: CrewSimulatedHazardKind; label: string; center: LocalPoint; radiusX: number; radiusY: number; trajectory?: { start: LocalPoint; end: LocalPoint } };
export type CrewBaseArea = { id: string; label: string; point: LocalPoint; radiusM: number };
export type CrewSlopeGrid = { width: number; height: number; cellSizeM: number; westM: number; northM: number; values: Uint8Array };
export type CrewBaseScenario = { version: 1; locationId: string; seed: string; zones: CrewHazardZone[]; recommendedAreas: CrewBaseArea[]; terrainScreened: boolean };
export type CrewSlopeAssessment = { slopeDeg: number | null; severity: "unknown" | "lower" | "caution" | "hazard" };

const labels: Record<CrewHazardKind, string> = { heat: "Heat", dust: "Dust", chemical: "Chemical", radiation: "Radiation", slope: "Slope", rockfall: "Rockfall", storm: "Storm" };
const roundingToleranceDeg = 1e-5;

function randomGenerator(seedText: string) {
  let seed = 2166136261;
  for (let index = 0; index < seedText.length; index += 1) { seed ^= seedText.charCodeAt(index); seed = Math.imul(seed, 16777619); }
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}
function overlaps(point: LocalPoint, zone: CrewHazardZone) {
  const dx = (point.x - zone.center.x) / zone.radiusX;
  const dy = (point.y - zone.center.y) / zone.radiusY;
  return dx * dx + dy * dy <= 1;
}
function slopeAt(point: LocalPoint, grid?: CrewSlopeGrid) {
  if (!grid || !Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(grid.cellSizeM) || grid.cellSizeM <= 0 || grid.width <= 0 || grid.height <= 0 || grid.values.length !== grid.width * grid.height || point.x < grid.westM || point.x > grid.westM + (grid.width - 1) * grid.cellSizeM || point.y > grid.northM || point.y < grid.northM - (grid.height - 1) * grid.cellSizeM) return null;
  const col = Math.round((point.x - grid.westM) / grid.cellSizeM);
  const row = Math.round((grid.northM - point.y) / grid.cellSizeM);
  if (col < 0 || col >= grid.width || row < 0 || row >= grid.height) return null;
  const encodedSlope = grid.values[row * grid.width + col];
  return encodedSlope !== undefined && encodedSlope < 255 ? encodedSlope * 0.25 : null;
}
/** Samples the fixed quarter-degree Jezero raster using the established illustrative 10°/15° bands. */
export function assessCrewSlope(point: LocalPoint, grid?: CrewSlopeGrid): CrewSlopeAssessment {
  const slopeDeg = slopeAt(point, grid);
  if (slopeDeg === null || !Number.isFinite(slopeDeg)) return { slopeDeg: null, severity: "unknown" };
  if (slopeDeg > ZONE_SLOPE_BANDS_DEG.cautionMax + roundingToleranceDeg) return { slopeDeg, severity: "hazard" };
  if (slopeDeg > ZONE_SLOPE_BANDS_DEG.lowerMax + roundingToleranceDeg) return { slopeDeg, severity: "caution" };
  return { slopeDeg, severity: "lower" };
}
export function canonicalCrewRegionId(locationId: string) {
  return locationId === "jezero-hirise-048842-048908-v1" ? "jezero" : locationId;
}
function terrainCandidates(grid: CrewSlopeGrid, missionPoint: LocalPoint): Array<{ point: LocalPoint; score: number }> {
  if (!grid.width || !grid.height || grid.values.length !== grid.width * grid.height || grid.cellSizeM <= 0) return [];
  const candidates: Array<{ point: LocalPoint; score: number }> = [];
  for (let row = 0; row < grid.height; row += 1) {
    for (let col = 0; col < grid.width; col += 1) {
      const point = { x: grid.westM + col * grid.cellSizeM, y: grid.northM - row * grid.cellSizeM };
      const distance = Math.hypot(point.x - missionPoint.x, point.y - missionPoint.y);
      const centerSlope = slopeAt(point, grid);
      if (point.x < 128 || point.x > 1920 || point.y < 128 || point.y > 1920 || distance < 160 || distance > 720 || centerSlope === null || centerSlope > ZONE_SLOPE_BANDS_DEG.lowerMax + roundingToleranceDeg) continue;
      let neighborhoodSlope = 0;
      let neighborhoodCount = 0;
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-2, -2], [2, 2], [-2, 2], [2, -2]]) {
        const neighbor = slopeAt({ x: point.x + dx * grid.cellSizeM, y: point.y - dy * grid.cellSizeM }, grid);
        if (neighbor !== null) { neighborhoodSlope += neighbor; neighborhoodCount += 1; }
      }
      if (neighborhoodCount < 6) continue;
      const meanSlope = neighborhoodSlope / neighborhoodCount;
      const distancePenalty = Math.abs(distance - 360) / 360;
      const terrainPenalty = centerSlope * 0.09 + Math.max(0, meanSlope - centerSlope) * 0.12;
      candidates.push({ point, score: distancePenalty + terrainPenalty });
    }
  }
  return candidates;
}
function fallbackCandidates(missionPoint: LocalPoint, random: () => number): Array<{ point: LocalPoint; score: number }> {
  const candidates: Array<{ point: LocalPoint; score: number }> = [];
  for (let y = 128; y <= 1920; y += 64) for (let x = 128; x <= 1920; x += 64) {
    const point = { x, y };
    const distance = Math.hypot(x - missionPoint.x, y - missionPoint.y);
    if (distance < 160 || distance > 720) continue;
    candidates.push({ point, score: Math.abs(distance - 360) / 360 + random() * 0.12 });
  }
  return candidates;
}
export function createCrewBaseScenario(seed: string, locationId: string, slopeGrid?: CrewSlopeGrid, missionPoint: LocalPoint = { x: 1024, y: 1024 }): CrewBaseScenario {
  locationId = canonicalCrewRegionId(locationId);
  const recommendationRandom = randomGenerator(locationId + ":" + seed + ":" + Math.round(missionPoint.x) + ":" + Math.round(missionPoint.y));
  const random = randomGenerator(locationId + ":" + seed);
  // Keep the slope draw in sequence so changing the terrain layer does not reshuffle other seeded hazards.
  const kinds: CrewHazardKind[] = ["heat", "dust", "chemical", "radiation", "slope", "rockfall", "storm"];
  const zones: CrewHazardZone[] = [];
  kinds.forEach((kind, index) => {
    if (random() >= 0.72) return;
    const center = { x: 220 + random() * 1608, y: 220 + random() * 1608 };
    const radiusX = 170 + random() * 180;
    const radiusY = 130 + random() * 190;
    let trajectory: CrewHazardZone["trajectory"];
    if (kind === "dust" || kind === "storm") {
      const angle = random() * Math.PI * 2;
      const halfLength = radiusX * 1.4;
      const endpoint = (direction: -1 | 1): LocalPoint => ({
        x: Math.max(0, Math.min(2048, center.x + Math.cos(angle) * halfLength * direction)),
        y: Math.max(0, Math.min(2048, center.y + Math.sin(angle) * halfLength * direction)),
      });
      trajectory = { start: endpoint(-1), end: endpoint(1) };
    }
    if (kind === "slope") return;
    zones.push({ id: kind + "-" + index, kind, label: labels[kind], center, radiusX, radiusY, ...(trajectory ? { trajectory } : {}) });
  });
  const hasTerrainGrid = Boolean(slopeGrid && slopeGrid.width > 0 && slopeGrid.height > 0 && slopeGrid.values.length === slopeGrid.width * slopeGrid.height && slopeGrid.cellSizeM > 0);
  const suitableCandidates = hasTerrainGrid && slopeGrid ? terrainCandidates(slopeGrid, missionPoint) : [];
  const terrainScreened = hasTerrainGrid;
  const candidates = (hasTerrainGrid ? suitableCandidates : fallbackCandidates(missionPoint, recommendationRandom))
    .filter(candidate => !zones.some(zone => overlaps(candidate.point, { ...zone, radiusX: zone.radiusX + 144, radiusY: zone.radiusY + 144 })))
    .sort((left, right) => left.score - right.score);
  const recommendedAreas: CrewBaseArea[] = [];
  for (const { point } of candidates) {
    if (recommendedAreas.length === 3) break;
    if (zones.some(zone => overlaps(point, zone)) || recommendedAreas.some(area => Math.hypot(area.point.x - point.x, area.point.y - point.y) < 420)) continue;
    const index = recommendedAreas.length;
    recommendedAreas.push({ id: "area-" + (index + 1), label: "Suggested area " + String.fromCharCode(65 + index), point, radiusM: 128 });
  }
  return { version: 1, locationId, seed, zones, recommendedAreas, terrainScreened };
}
export function crewBaseHazardsAt(point: LocalPoint | null, scenario: CrewBaseScenario) {
  return point ? scenario.zones.filter(zone => overlaps(point, zone)) : [];
}
export function createCrewBaseScenarioSeed() {
  return globalThis.crypto?.randomUUID?.() ?? Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);
}
