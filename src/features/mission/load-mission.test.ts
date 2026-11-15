import { it, expect } from "vitest";
import { validateManifest, decodeHeights, loadMission } from "./load-mission";
import manifest from "../../../public/data/jezero/manifest.json";
it("loads LF assets from a Linux checkout with their published checksums", async () => {
  const { readFile } = await import("node:fs/promises");
  const fetcher: typeof fetch = async (input) => {
    const name = String(input).split("/").at(-1)!;
    const bytes = await readFile("public/data/jezero/" + name);
    // Git text normalization must not invalidate the distributed package.
    return new Response(name.endsWith(".json") ? bytes.toString("utf8").replace(/\r\n/g, "\n") : bytes);
  };
  const mission = await loadMission("/data/jezero", fetcher);
  expect(mission.datasetId).toBe(manifest.datasetId);
  expect(mission.presetNodes.map(n => n.kind)).toEqual(["start", "stop", "stop", "stop", "end"]);
});
it("rejects absent layer provenance and invalid spacing", () => {
  expect(() =>
    validateManifest({
      ...manifest,
      layers: manifest.layers.map((l) => ({ ...l, productId: "" })),
    }),
  ).toThrow(/source|product/i);
  expect(() =>
    validateManifest({ ...manifest, grid: { ...manifest.grid, cellSizeM: 0 } }),
  ).toThrow(/grid/i);
});
it.each([
  ["missing", undefined],
  ["unknown kind", { ...manifest.coverage, kind: "observed" }],
  ["blank reason", { ...manifest.coverage, reason: " " }],
  ["wrong dataset", { ...manifest.coverage, datasetId: "other-site" }],
  ["limited with a dataset", { ...manifest.coverage, kind: "limited" }],
])("rejects %s terrain coverage", (_name, coverage) => {
  expect(() => validateManifest({ ...manifest, coverage })).toThrow(/coverage/i);
});
it.each([
  ["different site", { ...manifest, datasetId: "other-site", coverage: { ...manifest.coverage, datasetId: "other-site" } }],
  ["limited coverage", { ...manifest, coverage: { ...manifest.coverage, kind: "limited", datasetId: null } }],
])("rejects a package with %s before fetching terrain", async (_name, data) => {
  const fetched: string[] = [];
  const fetcher: typeof fetch = async (input) => {
    fetched.push(String(input));
    return Response.json(data);
  };
  await expect(loadMission("/data/jezero", fetcher, manifest.datasetId)).rejects.toThrow(/selected site/i);
  expect(fetched).toEqual(["/data/jezero/manifest.json"]);
});
it("rejects truncated height files", () =>
  expect(() => decodeHeights(new ArrayBuffer(7), manifest.grid)).toThrow(
    /height/i,
  ));
it("reports local fetch failures with a recovery clue", async () => {
  const fetcher: typeof fetch = async () =>
    new Response("missing", { status: 404 });
  await expect(loadMission("/missing", fetcher)).rejects.toThrow(
    /manifest.*404/i,
  );
});

it("rejects structurally damaged mission JSON before rendering", async () => {
  const { readFile } = await import("node:fs/promises");
  const meta = JSON.parse(
    await readFile("public/data/jezero/mission.json", "utf8"),
  );
  meta.presetNodes = [];
  const fetcher: typeof fetch = async (input) => {
    const name = String(input).split("/").at(-1)!;
    if (name === "mission.json") return Response.json(meta);
    return new Response(await readFile("public/data/jezero/" + name));
  };
  await expect(loadMission("/data/jezero", fetcher)).rejects.toThrow(
    /mission/i,
  );
});
