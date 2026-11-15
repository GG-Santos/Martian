import { expect, it } from "vitest";
import {
  buildTeamTimelines,
  sampleCrew,
  crewMembers,
  expeditionDuration,
} from "./crew-timeline";
import type { RouteNode } from "../mission/types";
const nodes: RouteNode[] = [
  { id: "h", kind: "start", point: { x: 0, y: 0 } },
  { id: "A", kind: "stop", stopId: "A", point: { x: 60, y: 0 } },
  { id: "end", kind: "end", point: { x: 0, y: 0 } },
];
const assumptions = { speedMps: 0.5, dwellMin: 1, allowanceMin: 120 };
it("schedules walking, dwell, buddy delay and repeatable seeks", () => {
  const timelines = buildTeamTimelines(nodes, assumptions),
    alpha = timelines[0];
  expect(alpha.durationSec).toBe(300);
  expect(expeditionDuration(timelines)).toBe(306);
  expect(sampleCrew(alpha, crewMembers[0], 60).point).toEqual({ x: 30, y: 0 });
  expect(sampleCrew(alpha, crewMembers[1], 66).point).toEqual({ x: 30, y: 0 });
  expect(sampleCrew(alpha, crewMembers[0], 120).activity).toBe("science");
  expect(sampleCrew(alpha, crewMembers[0], 180).activity).toBe("walking");
  expect(sampleCrew(alpha, crewMembers[1], 305).activity).toBe("walking");
  expect(sampleCrew(alpha, crewMembers[1], 306).activity).toBe("returned");
  expect(sampleCrew(alpha, crewMembers[1], 0).activity).toBe("waiting");
  const before = sampleCrew(alpha, crewMembers[0], 90);
  sampleCrew(alpha, crewMembers[0], 250);
  expect(sampleCrew(alpha, crewMembers[0], 90)).toEqual(before);
  expect(timelines[1].nodes[0].kind).toBe("start");
  expect(timelines[1].nodes.at(-1)?.kind).toBe("end");
});
it("handles zero distance and reverses waypoints without mutating input", () => {
  const snapshot = JSON.stringify(nodes);
  const routes = buildTeamTimelines(
    [
      nodes[0],
      { id: "w", kind: "waypoint", point: { x: 30, y: 0 } },
      nodes[1],
      nodes[2],
    ],
    assumptions,
  );
  expect(routes[1].nodes.map((n) => n.id)).toEqual(["end", "A", "w", "h"]);
  expect(JSON.stringify(nodes)).toBe(snapshot);
  const zero = buildTeamTimelines([nodes[0], nodes[2]], assumptions);
  expect(expeditionDuration(zero)).toBe(0);
  for (const member of crewMembers) {
    const state = sampleCrew(zero[0], member, 0);
    expect(state.activity).toBe("returned");
    expect(Number.isFinite(state.headingRad)).toBe(true);
  }
});
