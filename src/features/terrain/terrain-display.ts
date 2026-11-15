import type { HeightGrid, LocalPoint } from "../mission/types";
import { toScene } from "./spatial";

export type TerrainMode = "surface" | "physical" | "mesh" | "points";
export type ReliefScale = 1 | 3 | 5;
export type TerrainDisplay = {
  mode: TerrainMode;
  scale: ReliefScale;
  grid: boolean;
  contours: boolean;
};

export function displayPosition(
  point: LocalPoint,
  grid: HeightGrid,
  datumM: number,
  scale: ReliefScale,
  liftM = 0,
): [number, number, number] | null {
  const x = (point.x - grid.westM) / grid.cellSizeM;
  const y = (grid.northM - point.y) / grid.cellSizeM;
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    x < 0 ||
    y < 0 ||
    x > grid.width - 1 ||
    y > grid.height - 1
  )
    return null;
  const col = Math.min(Math.floor(x), grid.width - 2);
  const row = Math.min(Math.floor(y), grid.height - 2);
  const i = row * grid.width + col;
  const u = x - col,
    v = y - row;
  const b = grid.values[i + 1],
    c = grid.values[i + grid.width];
  const triangle =
    u + v <= 1
      ? [
          [grid.values[i], 1 - u - v],
          [b, u],
          [c, v],
        ]
      : [
          [grid.values[i + grid.width + 1], u + v - 1],
          [b, 1 - v],
          [c, 1 - u],
        ];
  if (triangle.some(([height]) => !Number.isFinite(height))) return null;
  const elevation = triangle.reduce(
    (sum, [height, weight]) => sum + height * weight,
    0,
  );
  return toScene(point, (elevation - datumM) * scale + liftM, grid);
}
