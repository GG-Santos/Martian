import { describe, expect, it } from "vitest";
import type { Hazard } from "../hazards/hazard-types";
import type { PlannedRoute } from "../mission/mission-plan";
import type { HeightGrid } from "../mission/types";
import { calculateMissionBudget, type MissionBudgetInput } from "./mission-budget";

const grid: HeightGrid = {
  width: 9, height: 3, cellSizeM: 10, westM: 0, northM: 20, values: new Float32Array(27),
};
const route: PlannedRoute = {
  id: "efficient",
  objectiveIds: ["primary", "optional"],
  nodes: [
    { id: "base-start", kind: "start", point: { x: 0, y: 10 } },
    { id: "primary", kind: "stop", point: { x: 30, y: 10 } },
    { id: "optional", kind: "stop", point: { x: 60, y: 10 } },
    { id: "base-end", kind: "end", point: { x: 0, y: 10 } },
  ],
};
const dust: Hazard = {
  id: "dust", category: "dust", title: "Dust", severity: "warning", evidence: "Scenario event",
  marker: { x: 30, y: 10 }, geometry: { kind: "sector" },
  description: "", risks: [], precautions: [], sources: [],
};
const input: MissionBudgetInput = {
  grid, route,
  crew: [
    { id: "a", oxygen: 90, battery: 75, stamina: 100, equipment: ["filter"] },
    { id: "b", oxygen: 40, battery: 20, stamina: 100, equipment: [] },
  ],
  objectiveDurationsMin: { primary: 2, optional: 3, unselected: 99 },
  assumptions: {
    walkingSpeedMps: 1, oxygenUsePerMinPct: 2, batteryUsePerMinPct: 1,
    returnReservePct: 15, slopeMultiplier: 1, stormMultiplierRange: [1, 3],
    preparationMin: 0, contingencyMin: 0, stormTravelMultiplier: 1,
  },
  hazardFrames: [],
};

describe("calculateMissionBudget", () => {
  it("adds outbound and return travel to only the selected objectives' dwell", () => {
    expect(calculateMissionBudget(input)).toMatchObject({
      distanceM: 120, travelTimeMin: 2, taskTimeMin: 5, totalTimeMin: 7,
      returnOxygenReserve: 15, returnBatteryReserve: 15,
      label: "Illustrative resource simulation",
    });
  });

  it("adds preparation and contingency to mission time without drawing suit resources", () => {
    const result = calculateMissionBudget({
      ...input,
      assumptions: { ...input.assumptions, preparationMin: 8, contingencyMin: 12 },
    });
    expect(result).toMatchObject({
      preparationMin: 8, contingencyMin: 12, travelTimeMin: 2, taskTimeMin: 5,
      evaTimeMin: 7, totalTimeMin: 27,
    });
    expect(result.perMember[0].oxygenUseRange.expectedPct).toBe(14);
    expect(result.perMember[0].batteryUseRange.expectedPct).toBe(7);
  });

  it("changes return ETA as a storm enters or leaves the same route", () => {
    const assumptions = { ...input.assumptions, stormTravelMultiplier: 3 };
    const clear = { ...dust, geometry: { kind: "cells" as const, cells: [] } };
    const startClear = { elapsedSol: 0, hazard: clear };
    const enters = { elapsedSol: 6 / 1479.6, hazard: dust };
    const leaves = { elapsedSol: 7 / 1479.6, hazard: clear };
    const storm = calculateMissionBudget({ ...input, assumptions, hazardFrames: [startClear, enters] });
    const clearing = calculateMissionBudget({ ...input, assumptions, hazardFrames: [startClear, enters, leaves] });
    const unaffected = calculateMissionBudget({ ...input, assumptions, hazardFrames: [startClear] });
    expect(storm).toMatchObject({ travelTimeMin: 4, taskTimeMin: 5, stormDelayMin: 2, evaTimeMin: 9, totalTimeMin: 9 });
    expect(clearing).toMatchObject({ travelTimeMin: 2.67, stormDelayMin: 0.67, evaTimeMin: 7.67 });
    expect(unaffected).toMatchObject({ travelTimeMin: 2, stormDelayMin: 0, evaTimeMin: 7 });
    expect(storm.perMember[0].oxygenUseRange).toEqual({ minPct: 18, expectedPct: 18, maxPct: 18 });
  });

  it.each([
    { clearsAfterSeconds: 2, delay: 0, eva: 0.17, oxygen: 0.33, batteryMax: 0.17, legs: [] },
    { clearsAfterSeconds: 4, delay: 0.03, eva: 0.2, oxygen: 0.4, batteryMax: 0.33, legs: [{ legIndex: 0, hazardIds: ["dust"] }] },
  ])("uses one exposure estimate when a storm clears after $clearsAfterSeconds seconds", ({
    clearsAfterSeconds, delay, eva, oxygen, batteryMax, legs,
  }) => {
    const shortRoute: PlannedRoute = {
      ...route, objectiveIds: [],
      nodes: [route.nodes[0], { id: "turn", kind: "waypoint", point: { x: 5, y: 10 } }, route.nodes[3]],
    };
    // The footprint begins 3 m into a single 5 m terrain sample. At 1 m/s
    // the clear-speed projection reaches it after 3 s. At half speed it takes 6 s.
    const nearby: Hazard = {
      ...dust,
      geometry: { kind: "polygon", points: [{ x: 3, y: 9 }, { x: 5, y: 9 }, { x: 5, y: 11 }, { x: 3, y: 11 }] },
    };
    const result = calculateMissionBudget({
      ...input, route: shortRoute,
      assumptions: { ...input.assumptions, stormTravelMultiplier: 2 },
      hazardFrames: [
        { elapsedSol: 0, hazard: nearby },
        { elapsedSol: clearsAfterSeconds / 60 / 1479.6, hazard: { ...dust, geometry: { kind: "cells", cells: [] } } },
      ],
    });
    expect(result).toMatchObject({ stormDelayMin: delay, evaTimeMin: eva, exposedSegments: legs });
    expect(result.perMember[0].oxygenUseRange.expectedPct).toBe(oxygen);
    expect(result.perMember[0].batteryUseRange.maxPct).toBe(batteryMax);
  });

  it("slows walking on sloped terrain without adding task time", () => {
    const sloped = { ...grid, values: Float32Array.from(grid.values, (_, index) => index % grid.width * 10) };
    const result = calculateMissionBudget({ ...input, grid: sloped });
    expect(result.travelTimeMin).toBe(3);
    expect(result.taskTimeMin).toBe(5);
    expect(result.perMember[0].oxygenUseRange.expectedPct).toBe(16);
  });

  it("uses later storm frames for return travel and estimates reserves from each member's starting balances", () => {
    const distant: Hazard = {
      ...dust,
      geometry: { kind: "polygon", points: [{ x: 70, y: 0 }, { x: 80, y: 0 }, { x: 80, y: 20 }, { x: 70, y: 20 }] },
    };
    const result = calculateMissionBudget({
      ...input,
      hazardFrames: [
        { elapsedSol: 0, hazard: distant },
        { elapsedSol: 6 / 1479.6, hazard: dust },
      ],
    });
    expect(result.exposedSegments).toEqual([{ legIndex: 2, hazardIds: ["dust"] }]);
    expect(result.perMember).toEqual([
      {
        id: "a", oxygenStart: 90, batteryStart: 75,
        oxygenUseRange: { minPct: 14, expectedPct: 14, maxPct: 14 },
        oxygenRemainingRange: { minPct: 76, expectedPct: 76, maxPct: 76 },
        batteryUseRange: { minPct: 7, expectedPct: 8, maxPct: 9 },
        batteryRemainingRange: { minPct: 66, expectedPct: 67, maxPct: 68 },
        missingEquipment: [],
      },
      {
        id: "b", oxygenStart: 40, batteryStart: 20,
        oxygenUseRange: { minPct: 14, expectedPct: 14, maxPct: 14 },
        oxygenRemainingRange: { minPct: 26, expectedPct: 26, maxPct: 26 },
        batteryUseRange: { minPct: 7, expectedPct: 8, maxPct: 9 },
        batteryRemainingRange: { minPct: 11, expectedPct: 12, maxPct: 13 },
        missingEquipment: ["filter"],
      },
    ]);
  });

  it("includes storm exposure during stationary objective work", () => {
    const primary = route.nodes[1];
    const colocated: PlannedRoute = {
      ...route, objectiveIds: ["primary"],
      nodes: [{ ...route.nodes[0], point: primary.point }, primary, { ...route.nodes[3], point: primary.point }],
    };
    const result = calculateMissionBudget({ ...input, route: colocated, hazardFrames: [{ elapsedSol: 0, hazard: dust }] });
    expect(result.perMember[0].oxygenUseRange).toEqual({ minPct: 4, expectedPct: 4, maxPct: 4 });
    expect(result.perMember[0].batteryUseRange).toEqual({ minPct: 2, expectedPct: 4, maxPct: 6 });
  });

  it("keeps depleted balances at zero while preserving modeled demand", () => {
    const crew = [{ ...input.crew[0], oxygen: 0, battery: 1 }];
    const [member] = calculateMissionBudget({ ...input, crew }).perMember;
    expect(member.oxygenRemainingRange).toEqual({ minPct: 0, expectedPct: 0, maxPct: 0 });
    expect(member.batteryRemainingRange).toEqual(member.oxygenRemainingRange);
    expect(member.batteryUseRange.expectedPct).toBe(7);
  });

  it.each([
    { walkingSpeedMps: 0 }, { oxygenUsePerMinPct: NaN }, { batteryUsePerMinPct: -1 },
    { preparationMin: -1 }, { contingencyMin: NaN }, { stormTravelMultiplier: 0.9 },
    { returnReservePct: Infinity }, { returnReservePct: 110 }, { slopeMultiplier: -1 },
    { stormMultiplierRange: [3, 1] as [number, number] },
  ])("rejects invalid assumptions %o", (invalid) => {
    expect(() => calculateMissionBudget({ ...input, assumptions: { ...input.assumptions, ...invalid } })).toThrow(/assumption/i);
  });

  it("rejects non-finite dwell and overflowing demand", () => {
    expect(() => calculateMissionBudget({ ...input, objectiveDurationsMin: { primary: Infinity } })).toThrow(/duration/i);
    expect(() => calculateMissionBudget({ ...input, assumptions: { ...input.assumptions, oxygenUsePerMinPct: Number.MAX_VALUE } })).toThrow(/finite/i);
  });
});
