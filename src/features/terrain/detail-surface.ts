import type {
  DetailTile,
  HeightGrid,
  LocalPoint,
  StopId,
} from "../mission/types";
import { displayPosition, type ReliefScale } from "./terrain-display";
import { toScene } from "./spatial";
export type FocusCommand = { point: LocalPoint; stopId: StopId; token: number };
export function contains(grid: Omit<HeightGrid, "values">, point: LocalPoint) {
  return (
    point.x >= grid.westM &&
    point.x <= grid.westM + (grid.width - 1) * grid.cellSizeM &&
    point.y <= grid.northM &&
    point.y >= grid.northM - (grid.height - 1) * grid.cellSizeM
  );
}
export function stitchDetailEdge(
  detail: HeightGrid,
  overview: HeightGrid,
): HeightGrid {
  const values = detail.values.slice();
  for (let row = 0; row < detail.height; row++)
    for (let col = 0; col < detail.width; col++) {
      const distance =
        Math.min(row, col, detail.height - 1 - row, detail.width - 1 - col) *
        detail.cellSizeM;
      if (distance >= 8) continue;
      const point = {
        x: detail.westM + col * detail.cellSizeM,
        y: detail.northM - row * detail.cellSizeM,
      };
      const base = displayPosition(point, overview, 0, 1)?.[1];
      if (base !== undefined)
        values[row * detail.width + col] =
          base + ((values[row * detail.width + col] - base) * distance) / 8;
    }
  return { ...detail, values };
}
export function sampleDisplayedPosition(
  point: LocalPoint,
  overview: HeightGrid,
  detail: HeightGrid | null,
  datumM: number,
  scale: ReliefScale,
  liftM = 0,
): [number, number, number] | null {
  const grid = detail && contains(detail, point) ? detail : overview;
  const local = displayPosition(point, grid, datumM, scale, liftM);
  return local ? toScene(point, local[1], overview) : null;
}
export function chooseDetailTile(
  tiles: DetailTile[],
  focusedStop: StopId | null,
  target: LocalPoint,
  viewSpanM: number,
): DetailTile | null {
  if (focusedStop) return tiles.find((t) => t.stopId === focusedStop) ?? null;
  if (viewSpanM > 700) return null;
  const distance = (t: DetailTile) =>
    Math.hypot(target.x - t.grid.westM - 256, target.y - t.grid.northM + 256);
  return (
    tiles
      .filter((t) => contains(t.grid, target))
      .sort(
        (a, b) => distance(a) - distance(b) || a.stopId.localeCompare(b.stopId),
      )[0] ?? null
  );
}
export class LatestDetailRequest {
  private generation = 0;
  cancel() {
    this.generation++;
  }
  async run(
    load: () => Promise<HeightGrid | null>,
  ): Promise<HeightGrid | null | undefined> {
    const generation = ++this.generation;
    const result = await load();
    return generation === this.generation ? result : undefined;
  }
}
