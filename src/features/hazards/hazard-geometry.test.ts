import { expect, it } from "vitest";
import {
  pointInHazard,
  routeHazardConflicts,
  parseScenario,
} from "./hazard-geometry";
import type { Hazard } from "./hazard-types";
import type { LocalPoint, RouteNode } from "../mission/types";
const zone: Hazard = {
  id: "sand",
  category: "sand",
  title: "Sand",
  severity: "caution",
  evidence: "Reviewed scenario",
  marker: { x: 5, y: 5 },
  geometry: {
    kind: "polygon",
    points: [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ],
  },
  description: "test",
  risks: ["r"],
  precautions: ["p"],
  sources: ["https://nasa.gov"],
};
const route = (points: LocalPoint[]): RouteNode[] =>
  points.map((point, i) => ({
    id: String(i),
    kind: i === 0 ? "start" : "end",
    point,
  }));
it("detects crossed zones, boundary contact and repeated legs without near misses", () => {
  expect(
    routeHazardConflicts(
      route([
        { x: -5, y: 5 },
        { x: 15, y: 5 },
      ]),
      [zone],
    ),
  ).toEqual([{ hazardId: "sand", legIndexes: [0] }]);
  expect(
    routeHazardConflicts(
      route([
        { x: -5, y: 0 },
        { x: 15, y: 0 },
        { x: 5, y: 5 },
      ]),
      [zone],
    )[0].legIndexes,
  ).toEqual([0, 1]);
  expect(
    routeHazardConflicts(
      route([
        { x: -5, y: -0.1 },
        { x: 15, y: -0.1 },
      ]),
      [zone],
    ),
  ).toEqual([]);
  expect(pointInHazard({ x: 0, y: 0 }, zone)).toBe(true);
  expect(
    routeHazardConflicts(
      route([
        { x: 5, y: 5 },
        { x: 5, y: 5 },
      ]),
      [zone],
    ),
  ).toHaveLength(1);
  expect(
    routeHazardConflicts(
      route([
        { x: 15, y: 5 },
        { x: 15, y: 5 },
      ]),
      [zone],
    ),
  ).toHaveLength(0);
  expect(
    pointInHazard(
      { x: 200, y: 200 },
      { ...zone, geometry: { kind: "sector" } },
    ),
  ).toBe(true);
});
it("rejects malformed scenario polygons and unknown categories", () => {
  expect(
    parseScenario([zone], { westM: 0, eastM: 2048, southM: 0, northM: 2048 }),
  ).toHaveLength(1);
  expect(
    parseScenario([{ ...zone, category: "fake" }], {
      westM: 0,
      eastM: 2048,
      southM: 0,
      northM: 2048,
    }),
  ).toEqual([]);
  expect(
    parseScenario(
      [{ ...zone, geometry: { kind: "polygon", points: [{ x: NaN, y: 0 }] } }],
      { westM: 0, eastM: 2048, southM: 0, northM: 2048 },
    ),
  ).toEqual([]);
});
