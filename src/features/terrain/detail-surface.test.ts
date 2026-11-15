import { expect, it } from "vitest";
import type { HeightGrid, DetailTile } from "../mission/types";
import {
  stitchDetailEdge,
  sampleDisplayedPosition,
  chooseDetailTile,
  LatestDetailRequest,
} from "./detail-surface";
import { displayPosition } from "./terrain-display";
const overview: HeightGrid = {
  width: 5,
  height: 5,
  cellSizeM: 8,
  westM: 0,
  northM: 32,
  values: Float32Array.from({ length: 25 }, (_, i) => Math.sin(i) * 3),
};
const detail: HeightGrid = {
  width: 17,
  height: 17,
  cellSizeM: 1,
  westM: 8,
  northM: 24,
  values: new Float32Array(289).fill(30),
};
it("stitches all edge samples and retains native interior in one world frame", () => {
  const stitched = stitchDetailEdge(detail, overview);
  for (const scale of [1, 3, 5] as const)
    for (const t of [0, 0.3, 4.7, 8, 13.2, 16]) {
      for (const point of [
        { x: 8 + t, y: 24 },
        { x: 8 + t, y: 8 },
        { x: 8, y: 8 + t },
        { x: 24, y: 8 + t },
      ]) {
        const a = sampleDisplayedPosition(point, overview, stitched, 0, scale)!;
        const b = displayPosition(point, overview, 0, scale)!;
        a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 4));
      }
    }
  expect(
    sampleDisplayedPosition({ x: 16, y: 16 }, overview, stitched, 0, 1)?.[1],
  ).toBe(30);
});
it("selects one tile by focus or close target and discards stale requests", async () => {
  const tiles: DetailTile[] = [
    { stopId: "A", asset: "a", grid: detail },
    { stopId: "B", asset: "b", grid: { ...detail, westM: 30 } },
  ];
  expect(chooseDetailTile(tiles, "B", { x: 0, y: 0 }, 2000)?.stopId).toBe("B");
  expect(chooseDetailTile(tiles, null, { x: 16, y: 16 }, 600)?.stopId).toBe(
    "A",
  );
  expect(chooseDetailTile(tiles, null, { x: 16, y: 16 }, 701)).toBeNull();
  const request = new LatestDetailRequest();
  let resolveA!: (g: HeightGrid) => void;
  const a = request.run(
    () =>
      new Promise<HeightGrid>((resolve) => {
        resolveA = resolve;
      }),
  );
  const b = await request.run(async () => overview);
  resolveA(detail);
  expect(b).toBe(overview);
  expect(await a).toBeUndefined();
});
