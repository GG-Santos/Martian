import type {
  RouteState,
  RouteNode,
  RouteAction,
  HeightGrid,
  Result,
} from "../mission/types";
import { calculateRoute } from "./calculate-route";
export const defaultAssumptions = {
  speedMps: 0.5,
  allowanceMin: 120,
  dwellMin: 10,
};
export function createRouteState(nodes: RouteNode[]): RouteState {
  return {
    nodes: structuredClone(nodes),
    presetNodes: structuredClone(nodes),
    includedStopIds: ["A", "B", "C"],
    assumptions: { ...defaultAssumptions },
  };
}
export function resolveNodes(s: RouteState) {
  return s.nodes.filter(
    (n) =>
      n.kind !== "stop" || (n.stopId && s.includedStopIds.includes(n.stopId)),
  );
}
export function applyRouteAction(
  state: RouteState,
  action: RouteAction,
  grid: HeightGrid,
): Result<RouteState> {
  const s = structuredClone(state);
  const fail = (error: string): Result<RouteState> => ({ ok: false, error });
  if (action.type === "reset")
    return { ok: true, value: createRouteState(state.presetNodes) };
  if (action.type === "set-assumptions")
    s.assumptions = { ...action.assumptions };
  else if (action.type === "set-stop-included")
    s.includedStopIds = action.included
      ? [...new Set([...s.includedStopIds, action.stopId])]
      : s.includedStopIds.filter((id) => id !== action.stopId);
  else if (action.type === "insert") {
    if (s.nodes.filter((n) => n.kind === "waypoint").length >= 12)
      return fail("This demo allows up to 12 intermediate waypoints.");
    const index = s.nodes.findIndex((n) => n.id === action.afterNodeId);
    if (
      index < 0 ||
      index === s.nodes.length - 1 ||
      s.nodes.some((n) => n.id === action.id)
    )
      return fail("Choose a valid route edge and a new waypoint ID.");
    s.nodes.splice(index + 1, 0, {
      id: action.id,
      kind: "waypoint",
      point: action.point,
    });
  } else {
    const index = s.nodes.findIndex((n) => n.id === action.id),
      node = s.nodes[index];
    if (!node || node.kind !== "waypoint")
      return fail(
        "Habitat and science anchors are fixed. Select an intermediate waypoint.",
      );
    if (action.type === "move") node.point = action.point;
    if (action.type === "remove") s.nodes.splice(index, 1);
    if (action.type === "reorder") {
      const target = index + action.direction;
      if (s.nodes[target]?.kind !== "waypoint")
        return fail("Waypoints can only reorder within the same anchor span.");
      [s.nodes[index], s.nodes[target]] = [s.nodes[target], s.nodes[index]];
    }
  }
  const validation = calculateRoute(grid, resolveNodes(s), s.assumptions);
  return validation.ok ? { ok: true, value: s } : validation;
}
