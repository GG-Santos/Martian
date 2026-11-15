import type { RouteNode, StopId } from "../mission/types";
export function returnWalkMinutes(
  nodes: RouteNode[],
  stopId: StopId,
  speedMps: number,
): number | null {
  const index = nodes.findIndex(
    (n) => n.kind === "stop" && n.stopId === stopId,
  );
  if (
    index < 0 ||
    !Number.isFinite(speedMps) ||
    speedMps <= 0 ||
    nodes.at(-1)?.kind !== "end"
  )
    return null;
  let distance = 0;
  for (let i = index; i < nodes.length - 1; i++)
    distance += Math.hypot(
      nodes[i + 1].point.x - nodes[i].point.x,
      nodes[i + 1].point.y - nodes[i].point.y,
    );
  return Number.isFinite(distance) ? distance / speedMps / 60 : null;
}
