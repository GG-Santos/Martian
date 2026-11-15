import { expect, it } from "vitest";
import { assessProximity } from "./proximity";

it("uses connected links in local meters and names the separated crew", () => {
  const members = [
    { id: "a", point: { x: 0, y: 0 } },
    { id: "b", point: { x: 30, y: 40 } },
    { id: "c", point: { x: 60, y: 80 } },
  ];
  expect(assessProximity(members).components).toEqual([["a", "b", "c"]]);
  const separated = assessProximity([...members, { id: "d", point: { x: 200, y: 0 } }]);
  expect(separated.warning).toBe(true);
  expect(separated.components).toEqual([["a", "b", "c"], ["d"]]);
  expect(separated.affectedIds).toEqual(["a", "b", "c", "d"]);
});

it("holds a link within the hysteresis band and clears after moving inward", () => {
  const at = (distance: number) => [
    { id: "a", point: { x: 0, y: 0 } },
    { id: "b", point: { x: distance, y: 0 } },
  ];
  const connected = assessProximity(at(49));
  expect(assessProximity(at(52), 50, connected).warning).toBe(false);
  const warned = assessProximity(at(54), 50, connected);
  expect(warned.warning).toBe(true);
  expect(assessProximity(at(48), 50, warned).warning).toBe(true);
  expect(assessProximity(at(47), 50, warned).warning).toBe(true);
  expect(assessProximity(at(46), 50, warned).warning).toBe(false);
});

it("treats missing positions as unknown and never connects them", () => {
  const result = assessProximity([
    { id: "a", point: { x: 0, y: 0 } },
    { id: "b", point: null },
  ]);
  expect(result.warning).toBe(true);
  expect(result.missingIds).toEqual(["b"]);
  expect(result.components).toEqual([["a"], ["b"]]);
});
