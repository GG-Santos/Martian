import type { SiteCoverage } from "./types";

const jezeroDatasetId = "jezero-hirise-048842-048908-v1";

export type MissionLocation = {
  name: string;
  regionId: "jezero" | "gale" | "valles" | "unselected";
  provenance: string;
  observed: boolean;
  coverage: SiteCoverage;
};

export function boardLocation(missionId: string | null): MissionLocation {
  if (missionId === "jezero" || missionId === jezeroDatasetId) {
    return {
      name: "Jezero crater",
      regionId: "jezero",
      provenance: "Archived HiRISE optical sector",
      observed: true,
      coverage: { kind: "route-grade", datasetId: jezeroDatasetId, reason: "Registered HiRISE imagery and elevation cover this Jezero sector." },
    };
  }
  if (missionId === "gale") {
    return {
      name: "Gale crater",
      regionId: "gale",
      provenance: "Illustrative sector map · simulated terrain",
      observed: false,
      coverage: { kind: "limited", datasetId: null, reason: "Gale crater has no registered terrain grid for route planning." },
    };
  }
  if (missionId === "valles") {
    return {
      name: "Melas Chasma",
      regionId: "valles",
      provenance: "Illustrative sector map · simulated terrain",
      observed: false,
      coverage: { kind: "limited", datasetId: null, reason: "Melas Chasma has no registered terrain grid for route planning." },
    };
  }
  return {
    name: "Mission not selected",
    regionId: "unselected",
    provenance: "Illustrative planning grid · choose a mission in Crew",
    observed: false,
    coverage: {
      kind: "limited",
      datasetId: null,
      reason: missionId === null
        ? "Select a mission in Crew to check terrain coverage."
        : "The selected mission location has no registered terrain grid for route planning.",
    },
  };
}

export function canUseObservedTerrain(location: MissionLocation): boolean {
  return location.coverage.kind === "route-grade" && location.coverage.datasetId === jezeroDatasetId;
}
