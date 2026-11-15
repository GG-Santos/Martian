import { describe, expect, it } from "vitest";
import { buildWalkTimeline, sampleWalk } from "./marswalk-simulation";
import type { HeightGrid } from "./types";
import type { PlannedRoute } from "./mission-plan";

const grid: HeightGrid = {
  width: 5,
  height: 5,
  cellSizeM: 100,
  westM: 0,
  northM: 400,
  values: new Float32Array(25),
};
const route: PlannedRoute = {
  id: "efficient",
  objectiveIds: ["science"],
  nodes: [
    { id: "base", kind: "start", point: { x: 100, y: 100 } },
    { id: "science", kind: "stop", point: { x: 200, y: 100 } },
    { id: "return", kind: "end", point: { x: 100, y: 100 } },
  ],
};
const objective = {
  id: "science",
  title: "Sample the contact",
  durationMin: 10,
};

describe("Marswalk rehearsal", () => {
  it("spends time and suit resources on fieldwork while the crew stays at the objective", () => {
    const timeline = buildWalkTimeline(route, grid, [objective], []);
    const arrival = timeline.actions[0].minutes;
    const start = sampleWalk(timeline, arrival);
    const working = sampleWalk(timeline, arrival + 5);
    expect(working.point).toEqual(objectivePoint());
    expect(working.completed).toHaveLength(0);
    expect(start.oxygen - working.oxygen).toBeCloseTo(5 * 0.3 * 1.15);
    expect(start.battery - working.battery).toBeCloseTo(5 * 0.2 * 1.5);
    expect(working.action.kind).toBe("science");
  });

  it("succeeds only after completing science and returning with reserve", () => {
    const timeline = buildWalkTimeline(route, grid, [objective], []);
    const atObjective = sampleWalk(
      timeline,
      timeline.actions[0].minutes + objective.durationMin,
    );
    expect(atObjective.completed).toEqual([objective.id]);
    expect(atObjective.success).toBe(false);
    const end = sampleWalk(timeline, timeline.durationMin + 100);
    expect(end).toMatchObject({
      finished: true,
      returned: true,
      success: true,
      exhausted: false,
    });
    expect(end.point).toEqual(route.nodes[0].point);
    expect(end.distanceM).toBeCloseTo(200);
  });

  it("halts movement at the exact resource exhaustion time instead of finishing the route", () => {
    const timeline = buildWalkTimeline(route, grid, [objective], [], 0.5, 100);
    const end = sampleWalk(timeline, timeline.durationMin);
    expect(end).toMatchObject({
      finished: true,
      returned: false,
      success: false,
      exhausted: true,
      oxygen: 0,
    });
    expect(end.distanceM).toBeCloseTo(50);
    expect(end.elapsedMin).toBeCloseTo(0.5 / 0.3);
    expect(end.completed).toEqual([]);
  });

  it("reports a failed reserve decision even when the crew reaches home", () => {
    const timeline = buildWalkTimeline(route, grid, [objective], [], 24, 100);
    const end = sampleWalk(timeline, timeline.durationMin);
    expect(end).toMatchObject({
      returned: true,
      finished: true,
      success: false,
      exhausted: false,
      reserve: false,
    });
  });

  it("applies dust delay and additional battery draw on exposed travel", () => {
    const clear = buildWalkTimeline(route, grid, [objective], []);
    const dusty = buildWalkTimeline(
      route,
      grid,
      [objective],
      [
        {
          id: "dust",
          title: "Dust",
          category: "dust",
          evidence: "Scenario event",
          severity: "warning",
          marker: objectivePoint(),
          geometry: { kind: "sector" },
          description: "",
          risks: [],
          precautions: [],
          sources: [],
        },
      ],
    );
    expect(dusty.actions[0].minutes).toBeCloseTo(
      clear.actions[0].minutes * 1.25,
    );
    expect(dusty.actions[0].battery).toBeCloseTo(
      clear.actions[0].battery * 1.25 * 1.3,
    );
    expect(dusty.actions[1].minutes).toBe(objective.durationMin);
  });
});

function objectivePoint() {
  return { x: 200, y: 100 };
}
