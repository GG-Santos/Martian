import { expect, it } from "vitest";
import { returnWalkMinutes } from "./return-walk";
import type { RouteNode } from "../mission/types";
it("counts only remaining horizontal walking legs and handles excluded stops", () => {
  const nodes: RouteNode[] = [
    { id: "B", kind: "stop", stopId: "B", point: { x: 0, y: 0 } },
    { id: "C", kind: "stop", stopId: "C", point: { x: 60, y: 0 } },
    { id: "h", kind: "end", point: { x: 60, y: 30 } },
  ];
  expect(returnWalkMinutes(nodes, "B", 0.5)).toBe(3);
  expect(returnWalkMinutes(nodes, "B", 0)).toBeNull();
  expect(returnWalkMinutes(nodes, "A", 0.5)).toBeNull();
});
