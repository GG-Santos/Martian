import type { LocalPoint, Manifest } from "../mission/types";
import type { DustFrame, DustScenario, DustScenarioLocation } from "./dust-scenario";
import type { Hazard } from "./hazard-types";

const MARS_RADIUS_KM = 3394.84;
const RAD = Math.PI / 180;
const MARS_KM_PER_DEGREE = MARS_RADIUS_KM * RAD;
const MODEL_VERSION = "1";
const levels = ["low", "central", "high"] as const;
export const modeledDustScenarioIds = levels.map((level) => `modeled-${level}-v${MODEL_VERSION}`);
export const modeledDustDurationSol = 3;

function longitudeDelta(longitude: number, origin: number): number {
  return ((longitude - origin + 180) % 360 + 360) % 360 - 180;
}

function seededFraction(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  }
  return (hash >>> 0) / 2 ** 32;
}

export function buildModeledDustScenarios(
  location: DustScenarioLocation & { terrain: NonNullable<DustScenarioLocation["terrain"]> },
  startLs: number,
  seed: string,
): DustScenario[] {
  const { locationId, longitude, latitude, terrain } = location;
  const widthKm = (terrain.width - 1) * terrain.cellSizeM / 1000;
  const heightKm = (terrain.height - 1) * terrain.cellSizeM / 1000;
  const scaleKm = Math.min(widthKm, heightKm);
  const input = JSON.stringify([seed, locationId, longitude, latitude, startLs, terrain.westM, terrain.northM, widthKm, heightKm]);
  const northOffset = seededFraction(input) - 0.5;
  const direction = seededFraction(`direction:${input}`) < 0.5 ? -1 : 1;
  // A broad dusty-season proxy for exercise intensity, not a fitted local climatology.
  const season = 0.8 + 0.2 * Math.cos((startLs - 270) * RAD);
  const localLonKmPerDegree = MARS_KM_PER_DEGREE * Math.cos(latitude * RAD);
  return levels.map((level, index) => {
    const radiusKm = scaleKm * (0.25 + index * 0.15);
    const peakDepth = (0.55 + index * 0.45) * season;
    const frames = [0, 1, 2, modeledDustDurationSol].map((elapsedSol): DustFrame => {
      const intensity = [0.4, 1, 0.75, 0.3][elapsedSol];
      const centerLon = longitude + direction * (elapsedSol - 1.5) * widthKm * 0.22 / localLonKmPerDegree;
      const centerLat = latitude + northOffset * heightKm * 0.5 / MARS_KM_PER_DEGREE;
      return {
        elapsedSol,
        centerLon: longitudeDelta(centerLon, 0),
        centerLat: Math.min(90, Math.max(-90, centerLat)),
        radiusKm: radiusKm * (0.7 + 0.3 * intensity),
        opacityRange: [peakDepth * intensity * 0.6, peakDepth * intensity],
        observed: false,
        acquisitionSol: null,
        sourceRecordIds: [],
        regional: false,
        seed,
        modelVersion: MODEL_VERSION,
      };
    });
    return {
      id: modeledDustScenarioIds[index],
      locationId, startLs, source: "modeled", frames,
      uncertainty: { spatialRadiusKm: scaleKm / 2, opacityRange: [peakDepth * 0.18, peakDepth], confidence: "illustrative" },
      sourceRecords: [],
      assumptions: [
        `Illustrative ${level} dust exposure scenario, version ${MODEL_VERSION}, seeded with ${seed}.`,
        `Site center ${longitude}°E, ${latitude}°N, starting Ls ${startLs}°. Footprint ${widthKm} × ${heightKm} km.`,
        "The seasonal intensity proxy peaks at Ls 270° and is informed by Sánchez-Lavega et al. §6 (https://doi.org/10.1029/2024JE008565). The scenario has no empirical local calibration.",
        "The terrain footprint sets the display scale. Motion and depth are exercise parameters. There is no terrain-derived wind or visibility field.",
      ],
    };
  });
}

export function advanceDustScenario(scenario: DustScenario, elapsedSol: number): DustFrame | null {
  const first = scenario.frames[0];
  const last = scenario.frames.at(-1);
  if (!first || !last || !Number.isFinite(elapsedSol) || elapsedSol < first.elapsedSol || elapsedSol > last.elapsedSol) return null;
  const nextIndex = scenario.frames.findIndex((frame) => frame.elapsedSol >= elapsedSol);
  const next = scenario.frames[nextIndex];
  if (next.elapsedSol === elapsedSol) return next;
  const previous = scenario.frames[nextIndex - 1];
  const fraction = (elapsedSol - previous.elapsedSol) / (next.elapsedSol - previous.elapsedSol);
  const interpolate = (a: number, b: number) => a + (b - a) * fraction;
  const frame = {
    elapsedSol,
    centerLon: longitudeDelta(previous.centerLon + longitudeDelta(next.centerLon, previous.centerLon) * fraction, 0),
    centerLat: interpolate(previous.centerLat, next.centerLat),
    radiusKm: interpolate(previous.radiusKm, next.radiusKm),
    opacityRange: [interpolate(previous.opacityRange[0], next.opacityRange[0]), interpolate(previous.opacityRange[1], next.opacityRange[1])] as [number, number],
    observed: false as const,
    acquisitionSol: null,
    sourceRecordIds: [...new Set([...previous.sourceRecordIds, ...next.sourceRecordIds])],
    regional: previous.regional || next.regional,
  };
  if (!previous.observed && previous.modelVersion) return { ...frame, seed: previous.seed, modelVersion: previous.modelVersion };
  return frame;
}

function clipToBounds(points: LocalPoint[], bounds: Manifest["bounds"]): LocalPoint[] {
  const edges = [
    { axis: "x", limit: bounds.westM, side: 1 },
    { axis: "x", limit: bounds.eastM, side: -1 },
    { axis: "y", limit: bounds.southM, side: 1 },
    { axis: "y", limit: bounds.northM, side: -1 },
  ] as const;
  return edges.reduce((polygon, { axis, limit, side }) => {
    const clipped: LocalPoint[] = [];
    let previous = polygon.at(-1);
    if (!previous) return clipped;
    for (const current of polygon) {
      const priorInside = side * (previous[axis] - limit) >= 0;
      const currentInside = side * (current[axis] - limit) >= 0;
      if (priorInside !== currentInside) {
        const fraction = (limit - previous[axis]) / (current[axis] - previous[axis]);
        clipped.push({
          x: previous.x + (current.x - previous.x) * fraction,
          y: previous.y + (current.y - previous.y) * fraction,
          [axis]: limit,
        });
      }
      if (currentInside) clipped.push(current);
      previous = current;
    }
    return clipped;
  }, points);
}

export function projectDustFrame(frame: DustFrame, manifest: Manifest): Hazard | null {
  const { bounds, center, sourceCrs } = manifest;
  if (![frame.centerLon, frame.centerLat, frame.radiusKm, center.longitude, center.latitude,
    bounds.westM, bounds.eastM, bounds.southM, bounds.northM].every(Number.isFinite)
    || frame.radiusKm <= 0 || bounds.eastM <= bounds.westM || bounds.northM <= bounds.southM) return null;

  const midpoint = { x: (bounds.westM + bounds.eastM) / 2, y: (bounds.southM + bounds.northM) / 2 };
  const deltaLon = longitudeDelta(frame.centerLon, center.longitude);
  const deltaLat = frame.centerLat - center.latitude;
  // The historical footprint is an area-equivalent regional circle on Mars.
  const haversine = Math.sin(deltaLat * RAD / 2) ** 2
    + Math.cos(center.latitude * RAD) * Math.cos(frame.centerLat * RAD) * Math.sin(deltaLon * RAD / 2) ** 2;
  const distanceKm = 2 * MARS_RADIUS_KM * Math.asin(Math.sqrt(Math.min(1, haversine)));
  const halfDiagonalKm = Math.hypot(bounds.eastM - midpoint.x, bounds.northM - midpoint.y) / 1000;
  if (distanceKm > frame.radiusKm + halfDiagonalKm) return null;

  // Jezero's equirectangular grid uses the standard parallel recorded in its WKT.
  const parallel = Number(sourceCrs.match(/PARAMETER\["standard_parallel_1",\s*([-\d.]+)\]/i)?.[1] ?? center.latitude);
  const xScale = Math.cos(parallel * RAD);
  const frameScale = Math.cos(center.latitude * RAD);
  const metersPerDegree = MARS_KM_PER_DEGREE * 1000;
  const x = midpoint.x + deltaLon * metersPerDegree * xScale;
  const y = midpoint.y + deltaLat * metersPerDegree;
  const radiusM = frame.radiusKm * 1000;
  const points = frame.regional ? [] : clipToBounds(Array.from({ length: 32 }, (_, index) => {
    const angle = index * 2 * Math.PI / 32;
    return { x: x + Math.cos(angle) * radiusM * xScale / frameScale, y: y + Math.sin(angle) * radiusM };
  }), bounds);
  if (!frame.regional && points.length < 3) return null;

  const label = frame.observed ? "Historical dust observation"
    : frame.modelVersion ? "Modeled dust envelope" : "Interpolated historical dust";
  return {
    id: "simulation-dust",
    category: "dust",
    scenarioKind: "dust",
    title: label,
    severity: frame.opacityRange[1] >= 1 ? "warning" : "caution",
    evidence: "Scenario event",
    marker: frame.regional ? midpoint : {
      x: Math.min(bounds.eastM, Math.max(bounds.westM, x)),
      y: Math.min(bounds.northM, Math.max(bounds.southM, y)),
    },
    geometry: frame.regional ? { kind: "sector" } : { kind: "polygon", points },
    description: `${label}. Column optical depth ${frame.opacityRange[0].toFixed(2)}–${frame.opacityRange[1].toFixed(2)}. ${frame.regional ? "Regional context across the sector." : "Illustrative footprint for tabletop exposure."}`,
    risks: [frame.regional ? "Regional airborne dust exposure" : "Illustrative visibility impact"],
    precautions: [],
    sources: [...frame.sourceRecordIds],
  };
}
