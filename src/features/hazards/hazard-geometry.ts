import type { LocalPoint, RouteNode, Manifest } from "../mission/types";
import type { Hazard } from "./hazard-types";
const epsilon = 1e-7;
function onSegment(p: LocalPoint, a: LocalPoint, b: LocalPoint) {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const cross = (p.x - a.x) * (b.y - a.y) - (p.y - a.y) * (b.x - a.x);
  return (
    Math.abs(cross) <= epsilon * Math.max(1, length) &&
    p.x >= Math.min(a.x, b.x) - epsilon &&
    p.x <= Math.max(a.x, b.x) + epsilon &&
    p.y >= Math.min(a.y, b.y) - epsilon &&
    p.y <= Math.max(a.y, b.y) + epsilon
  );
}
function inside(p: LocalPoint, polygon: LocalPoint[]) {
  let contained = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[j],
      b = polygon[i];
    if (onSegment(p, a, b)) return true;
    if (
      a.y > p.y !== b.y > p.y &&
      p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x
    )
      contained = !contained;
  }
  return contained;
}
export function hazardPolygons(hazard: Hazard): LocalPoint[][] {
  if (hazard.geometry.kind === "polygon") return [hazard.geometry.points];
  if (hazard.geometry.kind === "sector")
    return [
      [
        { x: 0, y: 0 },
        { x: 2048, y: 0 },
        { x: 2048, y: 2048 },
        { x: 0, y: 2048 },
      ],
    ];
  return hazard.geometry.cells.map((c) => [
    { x: c.westM, y: c.northM },
    { x: c.westM + c.sizeM, y: c.northM },
    { x: c.westM + c.sizeM, y: c.northM - c.sizeM },
    { x: c.westM, y: c.northM - c.sizeM },
  ]);
}
export function pointInHazard(point: LocalPoint, hazard: Hazard) {
  return hazardPolygons(hazard).some((polygon) => inside(point, polygon));
}
function segmentsCross(
  a: LocalPoint,
  b: LocalPoint,
  c: LocalPoint,
  d: LocalPoint,
) {
  if (
    onSegment(a, c, d) ||
    onSegment(b, c, d) ||
    onSegment(c, a, b) ||
    onSegment(d, a, b)
  )
    return true;
  const cross = (p: LocalPoint, q: LocalPoint, r: LocalPoint) =>
    (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  return (
    cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0
  );
}
export function routeHazardConflicts(
  nodes: RouteNode[],
  hazards: Hazard[],
): { hazardId: string; legIndexes: number[] }[] {
  return hazards.flatMap((hazard) => {
    const polygons = hazardPolygons(hazard),
      legIndexes: number[] = [];
    for (let i = 0; i < nodes.length - 1; i++) {
      const a = nodes[i].point,
        b = nodes[i + 1].point;
      if (
        polygons.some(
          (p) =>
            inside(a, p) ||
            inside(b, p) ||
            p.some((c, j) => segmentsCross(a, b, c, p[(j + 1) % p.length])),
        )
      )
        legIndexes.push(i);
    }
    return legIndexes.length ? [{ hazardId: hazard.id, legIndexes }] : [];
  });
}
export function parseScenario(
  value: unknown,
  bounds: Manifest["bounds"],
): Hazard[] {
  if (!Array.isArray(value)) return [];
  const ids = new Set<string>();
  const validPoint = (p: LocalPoint) =>
    p &&
    [p.x, p.y].every(Number.isFinite) &&
    p.x >= bounds.westM &&
    p.x <= bounds.eastM &&
    p.y >= bounds.southM &&
    p.y <= bounds.northM;
  return value.filter((h: Hazard) => {
    if (
      !h ||
      typeof h.id !== "string" ||
      ids.has(h.id) ||
      !["depression", "sand", "rockfall", "dust"].includes(h.category) ||
      !["caution", "warning"].includes(h.severity) ||
      !["Reviewed scenario", "Scenario event"].includes(h.evidence) ||
      !validPoint(h.marker) ||
      typeof h.title !== "string" ||
      typeof h.description !== "string" ||
      ![h.risks, h.precautions, h.sources].every(
        (a) =>
          Array.isArray(a) &&
          a.length > 0 &&
          a.every((s) => typeof s === "string"),
      ) ||
      !h.sources.every((s) => s.startsWith("https://"))
    )
      return false;
    if (h.geometry?.kind === "sector" && h.category === "dust") {
      ids.add(h.id);
      return true;
    }
    if (
      h.geometry?.kind !== "polygon" ||
      !Array.isArray(h.geometry.points) ||
      h.geometry.points.length < 3 ||
      h.geometry.points.length > 100 ||
      !h.geometry.points.every(validPoint)
    )
      return false;
    const area = h.geometry.points.reduce((sum, p, i) => {
      const q =
        h.geometry.kind === "polygon"
          ? h.geometry.points[(i + 1) % h.geometry.points.length]
          : p;
      return sum + p.x * q.y - q.x * p.y;
    }, 0);
    if (Math.abs(area) < epsilon) return false;
    ids.add(h.id);
    return true;
  });
}
