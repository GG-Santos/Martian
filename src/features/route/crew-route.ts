import type { Hazard } from "../hazards/hazard-types";
import type { HeightGrid, LocalPoint, RouteNode, RouteSummary } from "../mission/types";
import { buildRoundTripOptions, type PlannedObjective, type PlannedRoute } from "../mission/mission-plan";
import { calculateRoute } from "./calculate-route";
import { findTerrainAwarePath } from "./terrain-pathfinding";
import { defaultAssumptions } from "./route-state";

export type CrewRouteCandidate = { nodes: RouteNode[]; summary: RouteSummary };

export function buildCrewRouteCandidate(
  grid: HeightGrid,
  base: LocalPoint,
  objective: LocalPoint,
  hazards: Hazard[],
): CrewRouteCandidate | null {
  const path = findTerrainAwarePath(grid, base, objective, hazards);
  if (!path) return null;

  const nodes: RouteNode[] = path.map((point, index) => ({
    id: `crew-route-${index}`,
    point,
    kind: index === 0 || index === path.length - 1 ? "start" : "waypoint",
  }));
  const objectiveIndex = nodes.findIndex((node, index) =>
    index > 0 && index < nodes.length - 1 &&
    Math.hypot(node.point.x - objective.x, node.point.y - objective.y) < 1e-6,
  );
  if (objectiveIndex < 0) nodes.splice(nodes.length - 1, 0, {
    id: "crew-objective",
    point: objective,
    kind: "waypoint",
  });

  const result = calculateRoute(grid, nodes, defaultAssumptions);
  return result.ok ? { nodes, summary: result.value } : null;
}

export type CrewRouteOption = PlannedRoute & { summary: RouteSummary };

export function buildCrewRouteOptions(
  grid: HeightGrid,
  base: LocalPoint,
  primary: PlannedObjective,
  optional: PlannedObjective[],
  hazards: Hazard[],
): CrewRouteOption[] {
  return buildRoundTripOptions(grid, base, primary, optional, hazards).flatMap((route) => {
    const result = calculateRoute(grid, route.nodes, defaultAssumptions);
    return result.ok ? [{ ...route, summary: result.value }] : [];
  });
}
