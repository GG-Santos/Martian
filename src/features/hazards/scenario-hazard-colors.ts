import type { ScenarioHazardKind } from "./hazard-types";

export const scenarioHazardColors = {
  heat: "#f0a060",
  dust: "#e4cb85",
  chemical: "#8cc5a9",
  radiation: "#d99bc1",
  rockfall: "#d58b73",
  storm: "#b7a2e6",
} satisfies Record<ScenarioHazardKind, string>;
