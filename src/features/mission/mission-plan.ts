import type { Hazard } from "../hazards/hazard-types";
import { findTerrainAwareLeg } from "../route/terrain-pathfinding";
import type { HeightGrid, LocalPoint, RouteNode } from "./types";

export type RoutePreference = "efficient" | "lower-exposure";
export type PlannedObjective = { id: string; point: LocalPoint };
/** One complete round trip. Stop node IDs match the selected objective IDs. */
export type PlannedRoute = { id: RoutePreference; nodes: RouteNode[]; objectiveIds: string[] };

export const routePreferences = ["efficient", "lower-exposure"] as const satisfies readonly RoutePreference[];

export function buildRoundTripOptions(
  grid: HeightGrid,
  base: LocalPoint,
  primary: PlannedObjective,
  optionalObjectives: PlannedObjective[],
  hazards: Hazard[],
): PlannedRoute[] {
  const objectives = [primary, ...optionalObjectives];
  const destinations = [
    ...objectives.map(({ id, point }) => ({ id, point, kind: "stop" as const })),
    { id: "expedition-base-end", point: base, kind: "end" as const },
  ];
  return routePreferences.flatMap((id) => {
    const nodes: RouteNode[] = [{ id: "expedition-base-start", point: base, kind: "start" }];
    for (const destination of destinations) {
      const leg = findTerrainAwareLeg(grid, nodes.at(-1)!.point, destination.point, hazards, id);
      if (!leg) return [];
      for (const point of leg.slice(1, -1)) {
        nodes.push({ id: "expedition-waypoint-" + nodes.length, point, kind: "waypoint" });
      }
      nodes.push(destination);
    }
    return [{ id, nodes, objectiveIds: objectives.map((objective) => objective.id) }];
  });
}
