import type { HeightGrid, LocalPoint } from "../mission/types";
import { sampleHeight, sampleSlopeDeg } from "./spatial";
import { contains } from "./detail-surface";
export function inspectTerrain(
  point: LocalPoint,
  grid: HeightGrid,
  thermal: Uint8Array | null,
) {
  const inside =
    Number.isFinite(point.x) &&
    Number.isFinite(point.y) &&
    contains(grid, point);
  const index =
    Math.round((grid.northM - point.y) / grid.cellSizeM) * grid.width +
    Math.round((point.x - grid.westM) / grid.cellSizeM);
  const dn = inside ? thermal?.[index] : null;
  return {
    point,
    elevationM: sampleHeight(grid, point),
    slopeDeg: sampleSlopeDeg(grid, point),
    thermalDn: dn && dn > 0 ? dn : null,
  };
}
