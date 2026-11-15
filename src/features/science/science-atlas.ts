import type { Manifest } from "../mission/types";
import { loadOptionalAsset } from "../mission/load-mission";
export type ScienceCategory =
  | "optical"
  | "thermal"
  | "topographic"
  | "atmospheric"
  | "spectral"
  | "geophysical"
  | "radiation"
  | "chemical";
export type EvidenceCategory =
  "spectral" | "geophysical" | "radiation" | "chemical";
export type ScienceEvidenceRecord = {
  category: EvidenceCategory;
  title: string;
  scope: "Regional evidence" | "Rover target" | "Mars context";
  instrument: string;
  location: string;
  observationTime: string | null;
  dateNote?: string;
  asset: string;
  imageAlt: string;
  credit: string;
  sourceUrl: string;
  productId: string;
  units: string;
  explanation: string;
  key: { label: string; description: string }[];
};
export function parseScienceAtlas(
  value: unknown,
): Partial<Record<ScienceCategory, ScienceEvidenceRecord>> {
  const result: Partial<Record<ScienceCategory, ScienceEvidenceRecord>> = {};
  if (!Array.isArray(value)) return result;
  for (const item of value as ScienceEvidenceRecord[]) {
    if (
      !item ||
      !["spectral", "geophysical", "radiation", "chemical"].includes(
        item.category,
      ) ||
      !["Regional evidence", "Rover target", "Mars context"].includes(
        item.scope,
      )
    )
      continue;
    if (
      ![
        item.title,
        item.instrument,
        item.location,
        item.imageAlt,
        item.credit,
        item.sourceUrl,
        item.productId,
        item.units,
        item.explanation,
      ].every((v) => typeof v === "string" && v.length > 0) ||
      !item.sourceUrl.startsWith("https://") ||
      item.asset !== `atlas/${item.category}.webp` ||
      (item.dateNote !== undefined && typeof item.dateNote !== "string") ||
      (item.observationTime !== null &&
        typeof item.observationTime !== "string") ||
      !Array.isArray(item.key) ||
      !item.key.every(
        (k) =>
          k && typeof k.label === "string" && typeof k.description === "string",
      )
    )
      continue;
    result[item.category] = {
      category: item.category,
      title: item.title,
      scope: item.scope,
      instrument: item.instrument,
      location: item.location,
      observationTime: item.observationTime,
      dateNote: item.dateNote,
      asset: item.asset,
      imageAlt: item.imageAlt,
      credit: item.credit,
      sourceUrl: item.sourceUrl,
      productId: item.productId,
      units: item.units,
      explanation: item.explanation,
      key: item.key,
    };
  }
  return result;
}
export async function loadScienceAtlas(baseUrl: string, manifest: Manifest) {
  const bytes = await loadOptionalAsset(
    baseUrl,
    "science-atlas.json",
    manifest,
    fetch,
  );
  if (!bytes) return {};
  try {
    return parseScienceAtlas(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return {};
  }
}
