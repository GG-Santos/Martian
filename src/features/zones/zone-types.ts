import type { LocalPoint } from "../mission/types";
import type { HazardEvidence } from "../hazards/hazard-types";

export type ZoneCategory = "safe" | "caution" | "hazard" | "unknown";
export type ZoneSourceClass = HazardEvidence | "Unknown";

export type ZoneEvidence = {
  sourceClass: ZoneSourceClass;
  label: string;
  hazardId?: string;
  sources: string[];
};

export type ZoneAssessment = {
  category: ZoneCategory;
  label: string;
  slopeDeg: number | null;
  evidence: ZoneEvidence[];
  reasons: string[];
  sourceClass: ZoneSourceClass;
};

export type ZoneCell = ZoneAssessment & {
  row: number;
  col: number;
  center: LocalPoint;
};

export type ZoneGrid = {
  width: number;
  height: number;
  cellSizeM: number;
  westM: number;
  northM: number;
  cells: ZoneCell[];
};
