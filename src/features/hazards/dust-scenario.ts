import type { HeightGrid } from "../mission/types";
import { buildModeledDustScenarios } from "./dust-simulation.ts";

export { advanceDustScenario, projectDustFrame } from "./dust-simulation.ts";

export type DustScenarioSource = "historical" | "modeled";
type Range = [number, number];
type AcquisitionRange = [string, string];
type Footprint = { west: number; east: number; south: number; north: number };

export type DustSourceRecord = {
  id: string;
  url: string;
  productId: string;
  acquisitionRange: AcquisitionRange;
  nativeResolutionKm: Range | null;
  units: string;
  processing: string;
  referenceUrls: string[];
};

type ObservedDustFrame = FrameGeometry & { observed: true; acquisitionSol: string; acquisitionUtc: string; solarLongitude: number };

type FrameGeometry = {
  elapsedSol: number;
  centerLon: number;
  centerLat: number;
  radiusKm: number;
  opacityRange: Range;
  sourceRecordIds: string[];
  regional: boolean;
};

export type DustFrame = ObservedDustFrame | (FrameGeometry & (
  | { observed: false; acquisitionSol: null; seed: string; modelVersion: string }
  | { observed: false; acquisitionSol: null; seed?: never; modelVersion?: never }
));

export type DustScenario = {
  id: string;
  locationId: string;
  source: DustScenarioSource;
  startLs: number;
  frames: DustFrame[];
  uncertainty: { spatialRadiusKm: number; opacityRange: Range; confidence: "regional" | "illustrative" };
  sourceRecords: DustSourceRecord[];
  assumptions: string[];
};

export type DustEventRecord = {
  id: string;
  locationId: string;
  footprint: Footprint;
  sourceUrl: string;
  productId: string;
  solarLongitude: Range;
  acquisitionRange: AcquisitionRange;
  nativeResolutionKm: Range;
  processing: string[];
  sourceRecords: DustSourceRecord[];
  frames: ObservedDustFrame[];
};

export type DustEventCatalog = { version: 1; events: DustEventRecord[] };
export type DustScenarioSelection = { status: DustScenarioSource | "unavailable"; scenarios: DustScenario[] };
export type DustScenarioLocation = { locationId: string; longitude: number; latitude: number; terrain: HeightGrid | null };

function assert(condition: unknown, field: string): asserts condition {
  if (!condition) throw new Error(`Invalid dust event ${field}`);
}

function record(value: unknown, field: string): Record<string, unknown> {
  assert(value && typeof value === "object" && !Array.isArray(value), field);
  return value as Record<string, unknown>;
}

function label(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function strings(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every(label);
}

function inRange(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function orderedRange(value: unknown, minimum: number, maximum: number): value is Range {
  return Array.isArray(value) && value.length === 2
    && inRange(value[0], minimum, maximum) && inRange(value[1], minimum, maximum) && value[0] <= value[1];
}

function httpsUrl(value: unknown): value is string {
  if (typeof value !== "string" || !value.startsWith("https://")) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

function acquisition(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}Z)?$/.test(value)) return false;
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) return false;
  const iso = new Date(millis).toISOString();
  return value.length === 10 ? iso.slice(0, 10) === value : iso.replace(".000Z", "Z") === value;
}

function acquisitionRange(value: unknown): value is AcquisitionRange {
  return Array.isArray(value) && value.length === 2 && acquisition(value[0]) && acquisition(value[1])
    && Date.parse(value[0]) <= Date.parse(value[1]);
}

function unique(ids: string[]): boolean {
  return new Set(ids).size === ids.length;
}

function parseSource(value: unknown): DustSourceRecord {
  const { id, url, productId, acquisitionRange: times, nativeResolutionKm, units, processing, referenceUrls } = record(value, "source");
  assert(label(id) && httpsUrl(url) && label(productId) && label(units) && label(processing), "source identity");
  assert(acquisitionRange(times), "source acquisition range");
  assert(nativeResolutionKm === null || orderedRange(nativeResolutionKm, Number.MIN_VALUE, Infinity), "source resolution");
  assert(strings(referenceUrls) && referenceUrls.every(httpsUrl), "source references");
  return { id, url, productId, acquisitionRange: times, nativeResolutionKm, units, processing, referenceUrls };
}

function parseEvent(value: unknown): DustEventRecord {
  const event = record(value, "record");
  const { id, locationId, sourceUrl, productId, solarLongitude, acquisitionRange: times, nativeResolutionKm, processing } = event;
  assert(label(id) && label(locationId) && httpsUrl(sourceUrl) && label(productId), "identity");
  assert(orderedRange(solarLongitude, 0, 360) && solarLongitude[1] < 360, "solar longitude");
  assert(acquisitionRange(times), "acquisition range");
  assert(orderedRange(nativeResolutionKm, Number.MIN_VALUE, Infinity) && strings(processing), "resolution or processing");

  const { west, east, south, north } = record(event.footprint, "footprint");
  assert(inRange(west, -180, 360) && inRange(east, -180, 360) && east - west <= 360 && west < east
    && inRange(south, -90, 90) && inRange(north, -90, 90) && south < north, "footprint");

  assert(Array.isArray(event.sourceRecords) && event.sourceRecords.length > 0, "source records");
  const sourceRecords = event.sourceRecords.map(parseSource);
  assert(unique(sourceRecords.map((source) => source.id)), "duplicate source records");
  const primary = sourceRecords.find((source) => source.url === sourceUrl && source.productId === productId);
  assert(primary && primary.acquisitionRange[0] === times[0] && primary.acquisitionRange[1] === times[1]
    && primary.nativeResolutionKm?.[0] === nativeResolutionKm[0]
    && primary.nativeResolutionKm[1] === nativeResolutionKm[1], "primary source metadata");

  assert(Array.isArray(event.frames) && event.frames.length >= 2, "frames");
  const frames = event.frames.map((value): ObservedDustFrame => {
    const { elapsedSol, centerLon, centerLat, radiusKm, opacityRange, observed, acquisitionSol,
      acquisitionUtc, solarLongitude: frameLs, sourceRecordIds, regional } = record(value, "frame");
    assert(inRange(elapsedSol, 0, Infinity) && inRange(centerLon, -180, 360) && inRange(centerLat, -90, 90)
      && inRange(radiusKm, Number.MIN_VALUE, 10_670) && orderedRange(opacityRange, 0, Infinity), "frame geometry or opacity");
    assert(observed === true && typeof regional === "boolean" && typeof acquisitionSol === "string"
      && /^\d+$/.test(acquisitionSol) && acquisition(acquisitionUtc) && acquisitionUtc.length > 10
      && inRange(Date.parse(acquisitionUtc), Date.parse(times[0]), Date.parse(times[1]))
      && inRange(frameLs, solarLongitude[0], solarLongitude[1]), "frame acquisition");
    assert(strings(sourceRecordIds) && unique(sourceRecordIds) && sourceRecordIds.includes(primary.id)
      && sourceRecordIds.every((sourceId) => sourceRecords.some((source) => source.id === sourceId)), "frame source references");
    return { elapsedSol, centerLon, centerLat, radiusKm, opacityRange, observed, acquisitionSol,
      acquisitionUtc, solarLongitude: frameLs, sourceRecordIds, regional };
  });
  assert(frames[0].elapsedSol === 0 && frames.slice(1).every((frame, index) => {
    const previous = frames[index];
    return frame.elapsedSol > previous.elapsedSol
      && frame.acquisitionUtc > previous.acquisitionUtc
      && frame.solarLongitude >= previous.solarLongitude;
  }), "frame order");
  const first = frames[0];
  const last = frames[frames.length - 1];
  assert(first.solarLongitude === solarLongitude[0] && last.solarLongitude === solarLongitude[1]
    && first.acquisitionUtc === times[0] && last.acquisitionUtc === times[1], "coverage endpoints");
  return { id, locationId, footprint: { west, east, south, north }, sourceUrl, productId,
    solarLongitude, acquisitionRange: times, nativeResolutionKm, processing, sourceRecords, frames };
}

export function parseDustEvents(value: unknown): DustEventCatalog {
  const catalog = record(value, "catalog");
  assert(catalog.version === 1 && Array.isArray(catalog.events), "catalog version or events");
  const events = catalog.events.map(parseEvent);
  assert(unique(events.map((event) => event.id)), "duplicate event IDs");
  return { version: 1, events };
}

export function matchesDustEvent(event: DustEventRecord, locationId: string, startLs: number): boolean {
  return event.locationId === locationId && inRange(startLs, ...event.solarLongitude);
}

export function selectDustScenario(
  catalog: DustEventCatalog, location: DustScenarioLocation, startLs: number, seed: string,
): DustScenarioSelection {
  const { locationId, longitude, latitude, terrain } = location;
  if (!label(locationId) || !inRange(longitude, -180, 360) || !inRange(latitude, -89.9, 89.9)
    || !inRange(startLs, 0, 360) || startLs === 360 || !label(seed) || !terrain
    || ![terrain.width, terrain.height].every((value) => Number.isSafeInteger(value) && value >= 2)
    || ![terrain.cellSizeM, terrain.northM, terrain.westM].every(Number.isFinite) || terrain.cellSizeM <= 0
    || terrain.values.length !== terrain.width * terrain.height
    || !Number.isFinite(terrain.cellSizeM * Math.max(terrain.width, terrain.height))) {
    return { status: "unavailable", scenarios: [] };
  }
  const historical = catalog.events.filter((event) => {
    const { west, east, south, north } = event.footprint;
    const eastLongitude = ((longitude - west) % 360 + 360) % 360 + west;
    return matchesDustEvent(event, locationId, startLs) && eastLongitude <= east && inRange(latitude, south, north);
  });
  if (!historical.length) {
    return { status: "modeled", scenarios: buildModeledDustScenarios({ locationId, longitude, latitude, terrain }, startLs, seed) };
  }
  return {
    status: "historical",
    scenarios: historical.map((event) => ({
      id: event.id,
      locationId,
      source: "historical",
      startLs: event.solarLongitude[0],
      frames: event.frames,
      uncertainty: {
        spatialRadiusKm: Math.max(...event.frames.map((frame) => frame.radiusKm)),
        opacityRange: [
          Math.min(...event.frames.map((frame) => frame.opacityRange[0])),
          Math.max(...event.frames.map((frame) => frame.opacityRange[1])),
        ],
        confidence: "regional",
      },
      sourceRecords: event.sourceRecords,
      assumptions: event.processing,
    })),
  };
}
