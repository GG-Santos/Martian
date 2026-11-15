import type { Hazard } from "../hazards/hazard-types";
import type { HeightGrid, LocalPoint, RouteNode } from "../mission/types";
import { estimateRoute, type CrewResources, type RouteEstimate } from "../resources/resource-model";

export type RouteOption = {
  id: string; nodes: RouteNode[]; estimate: RouteEstimate;
  feasible: boolean; reason: string;
};

/** Compare a direct loop and two offset loops; candidates are illustrative, not navigational guidance. */
export function proposeRoutes(
  start: LocalPoint, goal: LocalPoint, base: LocalPoint,
  grid: HeightGrid, hazards: Hazard[], crew: Omit<CrewResources, "battery">[],
): RouteOption[] {
  const dx = goal.x - start.x, dy = goal.y - start.y;
  const length = Math.hypot(dx, dy);
  const offset = Math.max(grid.cellSizeM * 2, Math.min(40, length / 3));
  const midpoint = { x: (start.x + goal.x) / 2, y: (start.y + goal.y) / 2 };
  const candidates: { id: string; via?: LocalPoint }[] = [
    { id: "direct" },
    { id: "left", via: { x: midpoint.x - dy / (length || 1) * offset, y: midpoint.y + dx / (length || 1) * offset } },
    { id: "right", via: { x: midpoint.x + dy / (length || 1) * offset, y: midpoint.y - dx / (length || 1) * offset } },
  ];
  return candidates.map(({ id, via }) => {
    const nodes: RouteNode[] = [
      { id: `${id}-start`, kind: "start", point: start },
      ...(via ? [{ id: `${id}-via`, kind: "waypoint" as const, point: via }] : []),
      { id: `${id}-goal`, kind: "waypoint", point: goal },
      { id: `${id}-base`, kind: "end", point: base },
    ];
    const estimate = estimateRoute(nodes, grid, hazards, crew);
    return { id, nodes, estimate, feasible: estimate.feasible,
      reason: estimate.reasons.length ? estimate.reasons.join(" ") : `${Math.round(estimate.distanceM)} m, ${estimate.travelTimeMin.toFixed(1)} min; illustrative resource simulation.` };
  }).sort((a, b) => Number(b.feasible) - Number(a.feasible) || a.estimate.distanceM - b.estimate.distanceM);
}
