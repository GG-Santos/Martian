import type {
  Assumptions,
  LocalPoint,
  RouteNode,
  StopId,
} from "../mission/types";
export type CrewId = "A1" | "A2" | "B1" | "B2";
export type TeamId = "alpha" | "bravo";
export type CrewMember = {
  id: CrewId;
  teamId: TeamId;
  name: string;
  role: string;
  departureOffsetSec: number;
};
export const crewMembers: CrewMember[] = [
  {
    id: "A1",
    teamId: "alpha",
    name: "Alex Chen",
    role: "Traverse lead",
    departureOffsetSec: 0,
  },
  {
    id: "A2",
    teamId: "alpha",
    name: "Sam Rivera",
    role: "Field geologist",
    departureOffsetSec: 6,
  },
  {
    id: "B1",
    teamId: "bravo",
    name: "Maya Santos",
    role: "Science lead",
    departureOffsetSec: 0,
  },
  {
    id: "B2",
    teamId: "bravo",
    name: "Noor Patel",
    role: "Systems specialist",
    departureOffsetSec: 6,
  },
];
export type CrewActivity = "waiting" | "walking" | "science" | "returned";
export type CrewPhase = {
  kind: "walk" | "dwell";
  startSec: number;
  endSec: number;
  from: LocalPoint;
  to: LocalPoint;
  legIndex: number;
  stopId?: StopId;
  distanceM: number;
};
export type TeamTimeline = {
  teamId: TeamId;
  nodes: RouteNode[];
  durationSec: number;
  phases: CrewPhase[];
};
export type CrewState = {
  member: CrewMember;
  point: LocalPoint;
  headingRad: number;
  activity: CrewActivity;
  legIndex: number | null;
  stopId: StopId | null;
  elapsedSec: number;
  remainingSec: number;
  travelledM: number;
  trail: LocalPoint[];
};
export function buildTeamTimelines(
  nodes: RouteNode[],
  assumptions: Assumptions,
): TeamTimeline[] {
  return (["alpha", "bravo"] as const).map((teamId) => {
    const ordered = (teamId === "alpha" ? nodes : [...nodes].reverse()).map(
      (node, index) => ({
        ...node,
        point: { ...node.point },
        kind:
          index === 0
            ? "start"
            : index === nodes.length - 1
              ? "end"
              : node.kind,
      }),
    ) as RouteNode[];
    const phases: CrewPhase[] = [];
    let time = 0;
    for (let i = 0; i < ordered.length - 1; i++) {
      const from = ordered[i].point,
        to = ordered[i + 1].point;
      const distanceM = Math.hypot(to.x - from.x, to.y - from.y);
      if (distanceM > 0) {
        const duration = distanceM / assumptions.speedMps;
        phases.push({
          kind: "walk",
          startSec: time,
          endSec: time + duration,
          from,
          to,
          legIndex: i,
          distanceM,
        });
        time += duration;
      }
      const destination = ordered[i + 1];
      if (destination.kind === "stop" && assumptions.dwellMin > 0) {
        const duration = assumptions.dwellMin * 60;
        phases.push({
          kind: "dwell",
          startSec: time,
          endSec: time + duration,
          from: to,
          to,
          legIndex: i,
          stopId: destination.stopId,
          distanceM: 0,
        });
        time += duration;
      }
    }
    return { teamId, nodes: ordered, durationSec: time, phases };
  });
}
export function expeditionDuration(timelines: TeamTimeline[]): number {
  return Math.max(
    0,
    ...timelines.map((t) => (t.durationSec > 0 ? t.durationSec + 6 : 0)),
  );
}
export function sampleCrew(
  timeline: TeamTimeline,
  member: CrewMember,
  missionSec: number,
): CrewState {
  const time = Math.max(0, Number.isFinite(missionSec) ? missionSec : 0);
  const local = time - member.departureOffsetSec;
  const elapsedSec = Math.max(0, Math.min(timeline.durationSec, local));
  const phase = timeline.phases.find(
    (p) => local >= p.startSec && local < p.endSec,
  );
  const ended = timeline.durationSec === 0 || local >= timeline.durationSec;
  const activity: CrewActivity = ended
    ? "returned"
    : local < 0
      ? "waiting"
      : phase?.kind === "dwell"
        ? "science"
        : "walking";
  const fraction = phase
    ? Math.max(
        0,
        Math.min(1, (local - phase.startSec) / (phase.endSec - phase.startSec)),
      )
    : 0;
  const point = phase
    ? {
        x: phase.from.x + (phase.to.x - phase.from.x) * fraction,
        y: phase.from.y + (phase.to.y - phase.from.y) * fraction,
      }
    : { ...(ended ? timeline.nodes.at(-1)!.point : timeline.nodes[0].point) };
  const walk =
    phase?.kind === "walk"
      ? phase
      : [...timeline.phases]
          .reverse()
          .find((p) => p.kind === "walk" && p.startSec <= elapsedSec);
  const headingRad = walk
    ? Math.atan2(walk.to.x - walk.from.x, -(walk.to.y - walk.from.y))
    : 0;
  const trail: LocalPoint[] = [timeline.nodes[0].point];
  let travelledM = 0;
  for (const segment of timeline.phases) {
    if (segment.kind !== "walk" || elapsedSec <= segment.startSec) continue;
    const progress = Math.min(
      1,
      (elapsedSec - segment.startSec) / (segment.endSec - segment.startSec),
    );
    travelledM += segment.distanceM * progress;
    const steps = Math.max(1, Math.ceil((segment.distanceM * progress) / 16));
    for (let i = 1; i <= steps; i++) {
      const t = (progress * i) / steps;
      trail.push({
        x: segment.from.x + (segment.to.x - segment.from.x) * t,
        y: segment.from.y + (segment.to.y - segment.from.y) * t,
      });
    }
  }
  return {
    member,
    point,
    headingRad,
    activity,
    legIndex: phase?.legIndex ?? null,
    stopId: phase?.stopId ?? null,
    elapsedSec,
    remainingSec: Math.max(0, timeline.durationSec - local),
    travelledM,
    trail,
  };
}
