import type {
  Assumptions,
  HeightGrid,
  RouteNode,
  RouteSample,
  RouteSummary,
  Result,
} from "../mission/types";
import { sampleHeight, sampleSlopeDeg } from "../terrain/spatial";
export function isCaution(slopeDeg: number) {
  return slopeDeg > 15 + 1e-8;
}
export function calculateRoute(
  grid: HeightGrid,
  nodes: RouteNode[],
  a: Assumptions,
): Result<RouteSummary> {
  const fail = (error: string): Result<RouteSummary> => ({ ok: false, error });
  if (
    ![a.speedMps, a.allowanceMin, a.dwellMin].every(Number.isFinite) ||
    a.speedMps <= 0 ||
    a.allowanceMin <= 0 ||
    a.dwellMin < 0
  )
    return fail(
      "Enter a positive walking speed and allowance, and a nonnegative stop time.",
    );
  if (
    nodes.length < 2 ||
    nodes.some((n) => ![n.point.x, n.point.y].every(Number.isFinite))
  )
    return fail("Route coordinates must be finite numbers.");
  const eastM = grid.westM + (grid.width - 1) * grid.cellSizeM;
  const southM = grid.northM - (grid.height - 1) * grid.cellSizeM;
  if (
    nodes.some(
      ({ point: p }) =>
        p.x < grid.westM || p.x > eastM || p.y < southM || p.y > grid.northM,
    )
  )
    return fail("Route leaves the mapped patch. The previous route was kept.");
  const samples: RouteSample[] = [];
  let distanceM = 0,
    ascentM = 0;
  for (let edge = 0; edge < nodes.length - 1; edge++) {
    const p = nodes[edge].point,
      q = nodes[edge + 1].point,
      dx = q.x - p.x,
      dy = q.y - p.y,
      len = Math.hypot(dx, dy);
    const count = Math.max(1, Math.ceil(len / (grid.cellSizeM / 2))),
      times = new Set<number>();
    for (let i = 0; i <= count; i++) times.add(i / count);
    // Check each crossed cell on both sides, even when a tiny corner is crossed.
    for (const [v, d, origin] of [
      [p.x, dx, grid.westM],
      [p.y, dy, grid.northM],
    ]) {
      if (d === 0) continue;
      const low = Math.ceil((Math.min(v, v + d) - origin) / grid.cellSizeM),
        high = Math.floor((Math.max(v, v + d) - origin) / grid.cellSizeM);
      for (let k = low; k <= high; k++) {
        const t = (origin + k * grid.cellSizeM - v) / d;
        if (t > 0 && t < 1) {
          times.add(t);
          times.add(Math.max(0, t - 1e-7));
          times.add(Math.min(1, t + 1e-7));
        }
      }
    }
    for (const t of [...times].sort((x, y) => x - y)) {
      const point = { x: p.x + dx * t, y: p.y + dy * t },
        elevationM = sampleHeight(grid, point),
        slopeDeg = sampleSlopeDeg(grid, point);
      if (elevationM === null || slopeDeg === null)
        return fail(
          "Route crosses missing terrain or leaves the mapped patch. The previous route was kept.",
        );
      if (edge > 0 && t === 0) continue;
      const previous = samples.at(-1);
      if (previous) ascentM += Math.max(0, elevationM - previous.elevationM);
      samples.push({
        ...point,
        elevationM,
        slopeDeg,
        distanceM: distanceM + len * t,
      });
    }
    distanceM += len;
  }
  const stops = new Set(
    nodes.filter((n) => n.kind === "stop").map((n) => n.stopId),
  );
  const durationMin = distanceM / a.speedMps / 60 + stops.size * a.dwellMin;
  if (
    ![distanceM, ascentM, durationMin, a.allowanceMin - durationMin].every(
      Number.isFinite,
    )
  )
    return fail(
      "These assumptions overflow the time estimate. Use a practical walking speed and stop time; the previous route was kept.",
    );
  return {
    ok: true,
    value: {
      distanceM,
      ascentM,
      durationMin,
      remainingMin: a.allowanceMin - durationMin,
      samples,
    },
  };
}
