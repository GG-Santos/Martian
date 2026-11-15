import type { LocalPoint } from "../mission/types";
export type HazardCategory =
  "slope" | "depression" | "sand" | "rockfall" | "dust";
export type ScenarioHazardKind =
  "heat" | "dust" | "chemical" | "radiation" | "rockfall" | "storm";
export type HazardEvidence =
  "Terrain-derived" | "Reviewed scenario" | "Scenario event";
export type Hazard = {
  id: string;
  category: HazardCategory;
  title: string;
  severity: "caution" | "warning";
  evidence: HazardEvidence;
  marker: LocalPoint;
  geometry:
    | {
        kind: "cells";
        cells: { westM: number; northM: number; sizeM: number }[];
      }
    | { kind: "polygon"; points: LocalPoint[] }
    | { kind: "sector" };
  description: string;
  risks: string[];
  precautions: string[];
  sources: string[];
  scenarioKind?: ScenarioHazardKind;
  communicationsNote?: string;
  slopeRangeDeg?: [number, number];
};
