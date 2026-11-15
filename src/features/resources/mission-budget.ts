import { pointInHazard, routeHazardConflicts } from "../hazards/hazard-geometry";
import type { Hazard } from "../hazards/hazard-types";
import type { PlannedRoute } from "../mission/mission-plan";
import type { HeightGrid, LocalPoint, RouteNode } from "../mission/types";
import { calculateRoute } from "../route/calculate-route";
import { equipmentForHazard, type CrewResources } from "./resource-model";

export type MissionBudgetAssumptions = {
  walkingSpeedMps: number;
  oxygenUsePerMinPct: number;
  batteryUsePerMinPct: number;
  returnReservePct: number;
  slopeMultiplier: number;
  preparationMin: number;
  contingencyMin: number;
  /** Walking time multiplier while crossing an active storm footprint. */
  stormTravelMultiplier: number;
  /** Battery draw multiplier range during storm exposure. */
  stormMultiplierRange: [number, number];
};

export type ResourceUseRange = { minPct: number; expectedPct: number; maxPct: number };

export type MissionBudgetInput = {
  route: PlannedRoute;
  grid: HeightGrid;
  crew: CrewResources[];
  objectiveDurationsMin: Record<string, number>;
  assumptions: MissionBudgetAssumptions;
  hazardFrames: Array<{ elapsedSol: number; hazard: Hazard }>;
};

export type MemberMissionBudget = {
  id: string;
  oxygenStart: number;
  oxygenUseRange: ResourceUseRange;
  oxygenRemainingRange: ResourceUseRange;
  batteryStart: number;
  batteryUseRange: ResourceUseRange;
  batteryRemainingRange: ResourceUseRange;
  missingEquipment: string[];
};

export type MissionBudget = {
  distanceM: number;
  travelTimeMin: number;
  taskTimeMin: number;
  preparationMin: number;
  contingencyMin: number;
  stormDelayMin: number;
  /** Walking and objective work, including weather-related walking delays. */
  evaTimeMin: number;
  /** EVA time plus the fixed allowances outside the EVA. */
  totalTimeMin: number;
  perMember: MemberMissionBudget[];
  /** Zero-based route edge indexes. Objective dwell belongs to its incoming edge. */
  exposedSegments: { legIndex: number; hazardIds: string[] }[];
  /** Percentage of full capacity to retain after returning to base. */
  returnOxygenReserve: number;
  returnBatteryReserve: number;
  label: "Illustrative resource simulation";
};

/** Tabletop defaults. Rates are percentage points of full capacity per EVA minute. */
export const defaultMissionBudgetAssumptions: MissionBudgetAssumptions = {
  walkingSpeedMps: 0.5,
  oxygenUsePerMinPct: 0.3,
  batteryUsePerMinPct: 0.2,
  returnReservePct: 20,
  slopeMultiplier: 1,
  preparationMin: 10,
  contingencyMin: 15,
  stormTravelMultiplier: 1.25,
  stormMultiplierRange: [1.1, 1.5],
};

const MINUTES_PER_SOL = 1479.6;

function requireFinite(...numbers: number[]) {
  if (!numbers.every(Number.isFinite)) throw new RangeError("Mission budget estimates must be finite.");
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function range(min: number, expected: number, max: number): ResourceUseRange {
  requireFinite(min, expected, max);
  return { minPct: round(min), expectedPct: round(expected), maxPct: round(max) };
}

function remaining(start: number, demand: SimulationDemand): ResourceUseRange {
  const [min, expected, max] = demand;
  return range(Math.max(0, start - max), Math.max(0, start - expected), Math.max(0, start - min));
}

type SimulationDemand = [min: number, expected: number, max: number];

/**
 * Integrates terrain-adjusted walking and baseline task minutes. The latest frame
 * for each hazard ID is held until a replacement. At terrain-sample resolution,
 * a clear-speed intersection marks the entire interval up to the next frame or
 * sample boundary as storm-exposed for walking time, battery draw, and reporting.
 * Overlapping storms share one walking multiplier and one battery multiplier.
 */
export function calculateMissionBudget({
  route, grid, crew, objectiveDurationsMin, assumptions, hazardFrames,
}: MissionBudgetInput): MissionBudget {
  const {
    walkingSpeedMps, oxygenUsePerMinPct, batteryUsePerMinPct, returnReservePct, slopeMultiplier,
    preparationMin, contingencyMin, stormTravelMultiplier, stormMultiplierRange: [stormMin, stormMax],
  } = assumptions;
  if (![walkingSpeedMps, oxygenUsePerMinPct, batteryUsePerMinPct, returnReservePct,
    slopeMultiplier, stormMin, stormMax, preparationMin, contingencyMin, stormTravelMultiplier].every(Number.isFinite)
    || walkingSpeedMps <= 0 || oxygenUsePerMinPct < 0 || batteryUsePerMinPct < 0
    || returnReservePct < 0 || returnReservePct > 100 || slopeMultiplier < 0
    || preparationMin < 0 || contingencyMin < 0 || stormTravelMultiplier < 1
    || stormMin < 1 || stormMax < stormMin) {
    throw new RangeError("Invalid mission budget assumptions.");
  }

  const { nodes } = route;
  const start = nodes[0]?.point;
  const end = nodes.at(-1)?.point;
  if (nodes.length < 2 || !start || !end || start.x !== end.x || start.y !== end.y) {
    throw new RangeError("The planned route must return to its departure point.");
  }

  const dwellById = new Map([...new Set(route.objectiveIds)].map((id) => {
    const duration = Object.hasOwn(objectiveDurationsMin, id) ? objectiveDurationsMin[id] : 0;
    if (!Number.isFinite(duration) || duration < 0) throw new RangeError("Invalid objective duration.");
    return [id, duration];
  }));
  const frames = hazardFrames.map(({ elapsedSol, hazard }) => {
    const timeMin = elapsedSol * MINUTES_PER_SOL;
    if (!Number.isFinite(timeMin)) throw new RangeError("Hazard frame times must be finite.");
    return { timeMin, hazard };
  }).sort((a, b) => a.timeMin - b.timeMin);

  const activeHazards = new Map<string, Hazard>();
  const requiredEquipment = new Set<string>();
  const exposedSegments: MissionBudget["exposedSegments"] = [];
  let distanceM = 0;
  let travelTimeMin = 0;
  let stormDelayMin = 0;
  let taskTimeMin = 0;
  let elapsedMin = 0;
  let stormMinutes = 0;
  let frameIndex = 0;

  function advance(
    baseMinutes: number, from: LocalPoint, to: LocalPoint, exposure: Set<string>,
  ): number {
    requireFinite(baseMinutes);
    const moving = from !== to;
    const pointAt = (walkedMin: number) => {
      const fraction = walkedMin / baseMinutes;
      return {
        x: from.x + (to.x - from.x) * fraction,
        y: from.y + (to.y - from.y) * fraction,
      };
    };
    const intersects = (hazard: Hazard, walkedMin: number, endWalkedMin: number) => {
      if (!moving) return pointInHazard(to, hazard);
      const segment: RouteNode[] = [
        { id: "exposure-start", kind: "start", point: pointAt(walkedMin) },
        { id: "exposure-end", kind: "end", point: pointAt(endWalkedMin) },
      ];
      return routeHazardConflicts(segment, [hazard]).length > 0;
    };
    const isStorm = (hazard: Hazard) => hazard.category === "dust" || hazard.scenarioKind === "storm";
    let walkedMin = 0;
    let actualMinutes = 0;
    while (walkedMin < baseMinutes) {
      // Treat frame boundaries within floating-point noise as simultaneous.
      const tolerance = 8 * Number.EPSILON * Math.max(1, Math.abs(elapsedMin));
      while (frameIndex < frames.length && frames[frameIndex].timeMin <= elapsedMin + tolerance) {
        const { hazard } = frames[frameIndex++];
        activeHazards.set(hazard.id, hazard);
      }
      const untilFrame = (frames[frameIndex]?.timeMin ?? Infinity) - elapsedMin;
      const remaining = baseMinutes - walkedMin;
      const clearEnd = Math.min(baseMinutes, walkedMin + untilFrame);
      const stormExposure = new Set<Hazard>();
      for (const hazard of activeHazards.values()) {
        if (isStorm(hazard) && intersects(hazard, walkedMin, clearEnd)) stormExposure.add(hazard);
      }
      const multiplier = moving && stormExposure.size ? stormTravelMultiplier : 1;
      const finishMin = remaining * multiplier;
      const finished = untilFrame >= finishMin - tolerance;
      const actual = finished ? finishMin : untilFrame;
      const progress = finished ? baseMinutes : Math.min(baseMinutes, walkedMin + actual / multiplier);
      for (const hazard of activeHazards.values()) {
        const exposed = isStorm(hazard)
          ? stormExposure.has(hazard)
          : intersects(hazard, walkedMin, progress);
        if (!exposed) continue;
        exposure.add(hazard.id);
        const equipment = equipmentForHazard[hazard.category];
        if (equipment) requiredEquipment.add(equipment);
      }
      if (stormExposure.size) stormMinutes += actual;
      stormDelayMin += actual * (1 - 1 / multiplier);
      elapsedMin += actual;
      actualMinutes += actual;
      requireFinite(elapsedMin);
      walkedMin = progress;
    }
    return actualMinutes;
  }

  for (let legIndex = 0; legIndex < nodes.length - 1; legIndex++) {
    const from = nodes[legIndex];
    const to = nodes[legIndex + 1];
    const result = calculateRoute(grid, [from, to], {
      speedMps: walkingSpeedMps, allowanceMin: 1, dwellMin: 0,
    });
    if (!result.ok) throw new RangeError(result.error);
    const { samples } = result.value;
    const exposure = new Set<string>();
    distanceM += result.value.distanceM;
    for (let i = 1; i < samples.length; i++) {
      const a = samples[i - 1];
      const b = samples[i];
      // A 90° slope contributes the full configured time penalty.
      const slopeFactor = 1 + slopeMultiplier * ((a.slopeDeg + b.slopeDeg) / 180);
      const minutes = (b.distanceM - a.distanceM) / walkingSpeedMps / 60 * slopeFactor;
      travelTimeMin += advance(minutes, a, b, exposure);
    }
    if (to.kind === "stop" && dwellById.has(to.id)) {
      const duration = dwellById.get(to.id)!;
      advance(duration, to.point, to.point, exposure);
      taskTimeMin += duration;
      dwellById.delete(to.id);
    }
    if (exposure.size) exposedSegments.push({ legIndex, hazardIds: [...exposure].sort() });
  }

  if (dwellById.size) throw new RangeError("Every selected objective must have a route stop.");
  const evaTimeMin = travelTimeMin + taskTimeMin;
  const totalTimeMin = preparationMin + evaTimeMin + contingencyMin;
  requireFinite(distanceM, totalTimeMin);
  const oxygenDemand = evaTimeMin * oxygenUsePerMinPct;
  const oxygen: SimulationDemand = [oxygenDemand, oxygenDemand, oxygenDemand];
  const baseBattery = evaTimeMin * batteryUsePerMinPct;
  const exposedBattery = Math.min(stormMinutes, evaTimeMin) * batteryUsePerMinPct;
  const stormExpected = stormMin + (stormMax - stormMin) / 2;
  const batteryDemand = (multiplier: number) => baseBattery + exposedBattery * (multiplier - 1);
  const battery: SimulationDemand = [
    batteryDemand(stormMin), batteryDemand(stormExpected), batteryDemand(stormMax),
  ];
  const oxygenUseRange = range(...oxygen);
  const batteryUseRange = range(...battery);

  const perMember = crew.map((member): MemberMissionBudget => {
    const oxygenStart = member.oxygen;
    const batteryStart = member.battery;
    if (![oxygenStart, batteryStart].every((value) => Number.isFinite(value) && value >= 0 && value <= 100)) {
      throw new RangeError("Starting oxygen and battery must be finite percentages between 0 and 100.");
    }
    return {
      id: member.id, oxygenStart: round(oxygenStart), batteryStart: round(batteryStart),
      oxygenUseRange: { ...oxygenUseRange }, batteryUseRange: { ...batteryUseRange },
      oxygenRemainingRange: remaining(oxygenStart, oxygen),
      batteryRemainingRange: remaining(batteryStart, battery),
      missingEquipment: [...requiredEquipment].filter((equipment) => !member.equipment.includes(equipment)).sort(),
    };
  });

  return {
    distanceM: round(distanceM), travelTimeMin: round(travelTimeMin), taskTimeMin: round(taskTimeMin),
    preparationMin: round(preparationMin), contingencyMin: round(contingencyMin),
    stormDelayMin: round(stormDelayMin), evaTimeMin: round(evaTimeMin),
    totalTimeMin: round(totalTimeMin), perMember, exposedSegments,
    returnOxygenReserve: round(returnReservePct), returnBatteryReserve: round(returnReservePct),
    label: "Illustrative resource simulation",
  };
}
