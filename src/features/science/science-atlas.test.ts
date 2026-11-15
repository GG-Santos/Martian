import { expect, it } from "vitest";
import { parseScienceAtlas } from "./science-atlas";
import { loadOptionalAsset } from "../mission/load-mission";
import type { Manifest } from "../mission/types";
import { createHash } from "node:crypto";
const record = {
  category: "spectral",
  title: "Minerals",
  scope: "Regional evidence",
  instrument: "CRISM",
  location: "Jezero",
  observationTime: null,
  asset: "atlas/spectral.webp",
  imageAlt: "Mineral map",
  credit: "NASA",
  sourceUrl: "https://science.nasa.gov/",
  productId: "PIA23380",
  units: "mineral indicators",
  explanation: "test",
  key: [{ label: "Green", description: "Carbonates" }],
};
it("keeps independently valid categories and rejects unsafe asset paths", () => {
  const parsed = parseScienceAtlas([
    record,
    { ...record, category: "chemical", title: 4 },
  ]);
  expect(parsed.spectral?.productId).toBe("PIA23380");
  expect(parsed.chemical).toBeUndefined();
  expect(parsed.spectral).not.toHaveProperty("coordinates");
  expect(parseScienceAtlas([{ ...record, asset: "../../secret" }])).toEqual({});
  expect(parseScienceAtlas([{ ...record, category: "unknown" }])).toEqual({});
});
it("checks evidence image bytes independently of neighboring metadata", async () => {
  const bytes = new Uint8Array([1, 2, 3]).buffer;
  const digest = createHash("sha256")
    .update(new Uint8Array(bytes))
    .digest("hex");
  const manifest = {
    assets: { "atlas/spectral.webp": digest, "atlas/chemical.webp": "wrong" },
  } as unknown as Manifest;
  expect(
    await loadOptionalAsset(
      "/data",
      "atlas/spectral.webp",
      manifest,
      async () => new Response(bytes),
    ),
  ).toEqual(bytes);
  expect(
    await loadOptionalAsset(
      "/data",
      "atlas/chemical.webp",
      manifest,
      async () => new Response(bytes),
    ),
  ).toBeNull();
});
