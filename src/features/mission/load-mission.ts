import type {
  HeightGrid,
  Manifest,
  MissionData,
  LocalPoint,
  DetailTile,
} from "./types";
import {
  validateEvidence,
  type ExpeditionEvidence,
} from "./expedition-evidence";
export function validateManifest(value: unknown): Manifest {
  const m = value as Manifest;
  if (
    !m?.grid ||
    ![m.grid.width, m.grid.height].every((v) => Number.isInteger(v) && v > 1) ||
    !Number.isFinite(m.grid.cellSizeM) ||
    m.grid.cellSizeM <= 0 ||
    ![m.grid.westM, m.grid.northM].every(Number.isFinite)
  )
    throw new Error(
      "Invalid terrain grid metadata. Retry with the bundled dataset.",
    );
  if (
    !Array.isArray(m.layers) ||
    !["optical", "slope", "thermal"].every((id) =>
      m.layers.some(
        (l) =>
          l.id === id &&
          l.productId &&
          l.mission &&
          l.reference &&
          l.units &&
          l.nativeResolutionM > 0,
      ),
    )
  )
    throw new Error("Missing science source product metadata.");
  if (typeof m.datasetId !== "string" || !m.datasetId.trim() || !m.sourceCrs || !m.assets?.["heights.f32"])
    throw new Error("Missing dataset identity or height checksum.");
  const coverage = m.coverage;
  if (
    !coverage ||
    typeof coverage.reason !== "string" ||
    !coverage.reason.trim() ||
    (coverage.kind !== "route-grade" && coverage.kind !== "limited") ||
    coverage.datasetId !== (coverage.kind === "route-grade" ? m.datasetId : null)
  ) {
    throw new Error("Missing or invalid terrain coverage metadata.");
  }
  return m;
}
export function decodeHeights(
  bytes: ArrayBuffer,
  g: Omit<HeightGrid, "values">,
): Float32Array {
  if (bytes.byteLength !== g.width * g.height * 4)
    throw new Error(
      "Terrain height byte length is invalid. Retry loading the dataset.",
    );
  const view = new DataView(bytes);
  const values = new Float32Array(g.width * g.height);
  for (let i = 0; i < values.length; i++)
    values[i] = view.getFloat32(i * 4, true);
  if (!values.some(Number.isFinite))
    throw new Error("Terrain heights contain no usable observations.");
  return values;
}
export function validateMissionMeta(
  value: unknown,
  manifest: Manifest,
): Omit<MissionData, "manifest" | "grid"> {
  const m = value as MissionData;
  const validPoint = (p: LocalPoint | undefined) =>
    p &&
    [p.x, p.y].every(Number.isFinite) &&
    p.x >= manifest.grid.westM &&
    p.x <=
      manifest.grid.westM +
        (manifest.grid.width - 1) * manifest.grid.cellSizeM &&
    p.y <= manifest.grid.northM &&
    p.y >=
      manifest.grid.northM -
        (manifest.grid.height - 1) * manifest.grid.cellSizeM;
  const fail = () => {
    throw new Error(
      "Mission metadata is damaged or does not match the terrain. Retry the original dataset.",
    );
  };
  if (
    !m ||
    m.datasetId !== manifest.datasetId ||
    ![m.title, m.brief, m.regionalContext].every((s) => typeof s === "string")
  )
    return fail();
  if (
    !Array.isArray(m.stops) ||
    m.stops.length !== 3 ||
    m.stops
      .map((s) => s?.id)
      .sort()
      .join("") !== "ABC" ||
    !m.stops.every(
      (s) =>
        validPoint(s.point) &&
        [s.title, s.question, s.context].every((t) => typeof t === "string") &&
        Array.isArray(s.references) &&
        s.references.length > 0 &&
        s.references.every(
          (r) => typeof r === "string" && r.startsWith("https://"),
        ) &&
        ["local", "regional"].includes(s.imageContext),
    )
  )
    return fail();
  if (
    !Array.isArray(m.presetNodes) ||
    m.presetNodes.length < 5 ||
    m.presetNodes.length > 17 ||
    !m.presetNodes.every(
      (n) =>
        n &&
        typeof n.id === "string" &&
        validPoint(n.point) &&
        ["start", "stop", "waypoint", "end"].includes(n.kind),
    ) ||
    new Set(m.presetNodes.map((n) => n.id)).size !== m.presetNodes.length
  )
    return fail();
  const first = m.presetNodes[0],
    last = m.presetNodes.at(-1)!;
  if (
    first.kind !== "start" ||
    last.kind !== "end" ||
    first.point.x !== last.point.x ||
    first.point.y !== last.point.y ||
    m.presetNodes
      .slice(1, -1)
      .some((n) => n.kind === "start" || n.kind === "end") ||
    m.presetNodes
      .filter((n) => n.kind === "stop")
      .map((n) => n.stopId)
      .join("") !== "ABC" ||
    m.stops.some(
      (s) =>
        !m.presetNodes.some(
          (n) =>
            n.kind === "stop" &&
            n.stopId === s.id &&
            n.point.x === s.point.x &&
            n.point.y === s.point.y,
        ),
    )
  )
    return fail();
  return m;
}
async function checksum(bytes: ArrayBuffer) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function loadOptionalAsset(
  baseUrl: string,
  name: string,
  manifest: Manifest,
  fetcher: typeof fetch,
) {
  const expected = manifest.assets[name];
  if (!expected) return null;
  try {
    const response = await fetcher(`${baseUrl}/${name}`);
    if (!response.ok) return null;
    const bytes = await response.arrayBuffer();
    return (await checksum(bytes)) === expected ? bytes : null;
  } catch {
    return null;
  }
}
export async function loadExpeditionEvidence(
  baseUrl: string,
  manifest: Manifest,
): Promise<ExpeditionEvidence> {
  const bytes = await loadOptionalAsset(
    baseUrl,
    "expedition-evidence.json",
    manifest,
    fetch,
  );
  if (!bytes) return { weather: null, regional: null };
  try {
    return validateEvidence(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return { weather: null, regional: null };
  }
}

export async function loadDisplayGrid(
  baseUrl: string,
  mission: MissionData,
  fetcher: typeof fetch = fetch,
): Promise<HeightGrid> {
  const { grid, manifest } = mission;
  const detail = manifest.reliefGrid;
  if (
    !detail ||
    detail.width !== 513 ||
    detail.height !== 513 ||
    detail.cellSizeM !== 4 ||
    detail.westM !== grid.westM ||
    detail.northM !== grid.northM ||
    (detail.width - 1) * detail.cellSizeM !==
      (grid.width - 1) * grid.cellSizeM ||
    (detail.height - 1) * detail.cellSizeM !==
      (grid.height - 1) * grid.cellSizeM
  )
    return grid;
  const bytes = await loadOptionalAsset(
    baseUrl,
    "relief.f32",
    manifest,
    fetcher,
  );
  if (!bytes || bytes.byteLength !== detail.width * detail.height * 4)
    return grid;
  try {
    const values = decodeHeights(bytes, detail);
    return values.every(Number.isFinite) ? { ...detail, values } : grid;
  } catch {
    return grid;
  }
}

export async function loadDetailTile(
  baseUrl: string,
  manifest: Manifest,
  tile: DetailTile,
  fetcher: typeof fetch = fetch,
): Promise<HeightGrid | null> {
  const g = tile.grid,
    overview = manifest.grid;
  const bundled = manifest.detailTiles?.find(
    (t) => t.stopId === tile.stopId && t.asset === tile.asset,
  );
  if (
    !bundled ||
    tile.asset !== `detail-${tile.stopId.toLowerCase()}.f32` ||
    !["A", "B", "C"].includes(tile.stopId) ||
    g.width !== 513 ||
    g.height !== 513 ||
    g.cellSizeM !== 1 ||
    ![g.westM, g.northM].every(Number.isFinite) ||
    g.westM !== bundled.grid.westM ||
    g.northM !== bundled.grid.northM ||
    (g.westM - overview.westM) % 8 !== 0 ||
    (overview.northM - g.northM) % 8 !== 0 ||
    g.westM < overview.westM ||
    g.westM + 512 >
      overview.westM + (overview.width - 1) * overview.cellSizeM ||
    g.northM > overview.northM ||
    g.northM - 512 <
      overview.northM - (overview.height - 1) * overview.cellSizeM
  )
    return null;
  const bytes = await loadOptionalAsset(baseUrl, tile.asset, manifest, fetcher);
  if (!bytes) return null;
  try {
    const values = decodeHeights(bytes, g);
    return values.every(Number.isFinite) ? { ...g, values } : null;
  } catch {
    return null;
  }
}

export async function loadScalarLayer(
  baseUrl: string,
  name: "slope" | "thermal",
  manifest: Manifest,
): Promise<Uint8Array | null> {
  const dims = manifest.scalarGrid;
  if (
    !dims ||
    dims.width !== manifest.grid.width ||
    dims.height !== manifest.grid.height
  )
    return null;
  const bytes = await loadOptionalAsset(baseUrl, `${name}.u8`, manifest, fetch);
  return bytes?.byteLength === dims.width * dims.height
    ? new Uint8Array(bytes)
    : null;
}
export async function loadMission(
  baseUrl: string,
  fetcher: typeof fetch = fetch,
  expectedDatasetId?: string,
): Promise<MissionData> {
  async function get(name: string) {
    const r = await fetcher(`${baseUrl}/${name}`);
    if (!r.ok)
      throw new Error(
        `${name} could not load (${r.status}). Retry the local dataset.`,
      );
    return r;
  }
  const manifest = validateManifest(await (await get("manifest.json")).json());
  if (expectedDatasetId !== undefined &&
    (manifest.datasetId !== expectedDatasetId || manifest.coverage.kind !== "route-grade")) {
    throw new Error("Terrain package does not provide route-grade coverage for the selected site.");
  }
  const [missionBytes, bytes] = await Promise.all([
    get("mission.json").then((r) => r.arrayBuffer()),
    get("heights.f32").then((r) => r.arrayBuffer()),
  ]);
  const values = decodeHeights(bytes, manifest.grid);
  const digest = await checksum(bytes);
  if (digest !== manifest.assets["heights.f32"])
    throw new Error(
      "Terrain height checksum failed. Retry with the original bundled asset.",
    );
  if ((await checksum(missionBytes)) !== manifest.assets["mission.json"])
    throw new Error(
      "Mission metadata checksum failed. Retry the original mission.json asset.",
    );
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(missionBytes));
  } catch {
    throw new Error("Mission JSON is damaged. Retry the original dataset.");
  }
  const meta = validateMissionMeta(parsed, manifest);
  return { ...meta, manifest, grid: { ...manifest.grid, values } };
}
