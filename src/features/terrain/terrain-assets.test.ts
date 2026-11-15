import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { loadDisplayGrid, loadDetailTile } from "../mission/load-mission";
import type { MissionData } from "../mission/types";
import type { DetailTile, Manifest } from "../mission/types";

it("accepts only registered, complete and checksummed meter tiles", async () => {
  const bytes = new ArrayBuffer(513 ** 2 * 4);
  const tile: DetailTile = {
    stopId: "A",
    asset: "detail-a.f32",
    grid: { width: 513, height: 513, cellSizeM: 1, westM: 376, northM: 968 },
  };
  const manifest = {
    grid: { width: 257, height: 257, cellSizeM: 8, westM: 0, northM: 2048 },
    detailTiles: [tile],
    assets: {
      [tile.asset]: createHash("sha256")
        .update(new Uint8Array(bytes))
        .digest("hex"),
    },
  } as unknown as Manifest;
  const fetcher = async () => new Response(bytes);
  expect(
    (await loadDetailTile("/data", manifest, tile, fetcher))?.cellSizeM,
  ).toBe(1);
  expect(
    await loadDetailTile(
      "/data",
      { ...manifest, assets: { [tile.asset]: "bad" } },
      tile,
      fetcher,
    ),
  ).toBeNull();
  const outside = { ...tile, grid: { ...tile.grid, westM: 2048 } };
  expect(
    await loadDetailTile(
      "/data",
      { ...manifest, detailTiles: [outside] },
      outside,
      fetcher,
    ),
  ).toBeNull();
});

it("validates optional detail and falls back to the analysis grid", async () => {
  const grid = {
    width: 257,
    height: 257,
    cellSizeM: 8,
    westM: 0,
    northM: 2048,
    values: new Float32Array(257 ** 2),
  };
  const bytes = new ArrayBuffer(513 ** 2 * 4);
  const hash = createHash("sha256").update(new Uint8Array(bytes)).digest("hex");
  const mission = {
    grid,
    manifest: {
      reliefGrid: {
        width: 513,
        height: 513,
        cellSizeM: 4,
        westM: 0,
        northM: 2048,
      },
      assets: { "relief.f32": hash },
    },
  } as unknown as MissionData;
  expect(
    (await loadDisplayGrid("/data", mission, async () => new Response(bytes)))
      .cellSizeM,
  ).toBe(4);
  expect(
    await loadDisplayGrid(
      "/data",
      mission,
      async () => new Response(bytes.slice(0, 32)),
    ),
  ).toBe(grid);
  expect(
    await loadDisplayGrid("/data", {
      ...mission,
      manifest: { ...mission.manifest, reliefGrid: undefined },
    }),
  ).toBe(grid);
});
