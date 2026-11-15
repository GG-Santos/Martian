import type { LocalPoint, HeightGrid } from "./types";
import type { PlannedRoute } from "./mission-plan";
import type { Hazard } from "../hazards/hazard-types";
import { routeHazardConflicts } from "../hazards/hazard-geometry";
import { calculateRoute } from "../route/calculate-route";
import { defaultMissionBudgetAssumptions as defaults } from "../resources/mission-budget";

export type WalkAction = {
  kind: "travel" | "science";
  label: string;
  from: LocalPoint;
  to: LocalPoint;
  minutes: number;
  distanceM: number;
  oxygen: number;
  battery: number;
  hazards: string[];
  objectiveId?: string;
};
export type WalkTimeline = {
  actions: WalkAction[];
  durationMin: number;
  distanceM: number;
  oxygenStart: number;
  batteryStart: number;
  objectiveCount: number;
};

/** Reproducible educational model. Rates are percentage points per EVA minute. */
export function buildWalkTimeline(
  route: PlannedRoute,
  grid: HeightGrid,
  objectives: { id: string; title: string; durationMin: number }[],
  hazards: Hazard[],
  oxygenStart = 100,
  batteryStart = 100,
): WalkTimeline {
  const actions: WalkAction[] = [];
  for (let i = 1; i < route.nodes.length; i++) {
    const a = route.nodes[i - 1],
      b = route.nodes[i];
    const result = calculateRoute(grid, [a, b], {
      speedMps: defaults.walkingSpeedMps,
      allowanceMin: 120,
      dwellMin: 0,
    });
    if (!result.ok) throw new Error(result.error);
    const conflicts = routeHazardConflicts([a, b], hazards)
      .map((conflict) => hazards.find((h) => h.id === conflict.hazardId))
      .filter((h): h is Hazard => !!h);
    const storm = conflicts.some((h) => h.category === "dust");
    const distanceM = result.value.distanceM;
    const slopeFactor =
      1 +
      result.value.samples.reduce((sum, p) => sum + p.slopeDeg, 0) /
        Math.max(1, result.value.samples.length) /
        90;
    const minutes =
      (distanceM / defaults.walkingSpeedMps / 60) *
      slopeFactor *
      (storm ? defaults.stormTravelMultiplier : 1);
    actions.push({
      kind: "travel",
      label: b.kind === "end" ? "Returning to habitat" : "Crossing the surface",
      from: a.point,
      to: b.point,
      minutes,
      distanceM,
      oxygen: minutes * defaults.oxygenUsePerMinPct,
      battery: minutes * defaults.batteryUsePerMinPct * (storm ? 1.3 : 1),
      hazards: conflicts.map((h) => h.title),
    });
    const objective = objectives.find((o) => o.id === b.id);
    if (objective && b.kind === "stop")
      actions.push({
        kind: "science",
        label: objective.title,
        from: b.point,
        to: b.point,
        objectiveId: objective.id,
        minutes: objective.durationMin,
        distanceM: 0,
        oxygen: objective.durationMin * defaults.oxygenUsePerMinPct * 1.15,
        battery: objective.durationMin * defaults.batteryUsePerMinPct * 1.5,
        hazards: conflicts.map((h) => h.title),
      });
  }
  return {
    actions,
    durationMin: actions.reduce((s, a) => s + a.minutes, 0),
    distanceM: actions.reduce((s, a) => s + a.distanceM, 0),
    oxygenStart,
    batteryStart,
    objectiveCount: objectives.length,
  };
}

export function sampleWalk(timeline: WalkTimeline, requestedMinute: number) {
  let minute = Math.max(
    0,
    Math.min(
      Number.isFinite(requestedMinute) ? requestedMinute : 0,
      timeline.durationMin,
    ),
  );
  let oxygen = timeline.oxygenStart,
    battery = timeline.batteryStart,
    distanceM = 0,
    elapsedMin = 0;
  let point = timeline.actions[0]?.from ?? { x: 0, y: 0 };
  let action = timeline.actions[0];
  const completed: string[] = [];
  let exhausted = oxygen <= 0 || battery <= 0;
  for (const candidate of timeline.actions) {
    if (exhausted) break;
    action = candidate;
    const wanted =
      candidate.minutes === 0 ? 1 : Math.min(1, minute / candidate.minutes);
    const fraction = Math.max(
      0,
      Math.min(
        wanted,
        candidate.oxygen ? oxygen / candidate.oxygen : 1,
        candidate.battery ? battery / candidate.battery : 1,
      ),
    );
    point = {
      x: candidate.from.x + (candidate.to.x - candidate.from.x) * fraction,
      y: candidate.from.y + (candidate.to.y - candidate.from.y) * fraction,
    };
    oxygen = Math.max(0, oxygen - candidate.oxygen * fraction);
    battery = Math.max(0, battery - candidate.battery * fraction);
    elapsedMin += candidate.minutes * fraction;
    distanceM += candidate.distanceM * fraction;
    exhausted = oxygen < 1e-8 || battery < 1e-8;
    if (fraction >= 1 && candidate.objectiveId)
      completed.push(candidate.objectiveId);
    if (fraction < 1 || minute < candidate.minutes) break;
    minute -= candidate.minutes;
  }
  const returned = !exhausted && elapsedMin >= timeline.durationMin - 1e-8;
  const reserve =
    oxygen >= defaults.returnReservePct && battery >= defaults.returnReservePct;
  const finished = returned || exhausted;
  const success =
    returned && reserve && completed.length === timeline.objectiveCount;
  return {
    point,
    action,
    oxygen,
    battery,
    distanceM,
    elapsedMin,
    completed,
    returned,
    finished,
    success,
    exhausted,
    reserve,
  };
}
