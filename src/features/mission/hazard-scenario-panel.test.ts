import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DustScenario } from "../hazards/dust-scenario";
import { HazardScenarioPanel } from "./HazardScenarioPanel";
import { initialSimulationState } from "./simulation-clock";

describe("scenario provenance", () => {
  it.each(["regional", "illustrative"] as const)("shows the selected scenario's %s confidence without a current frame", (confidence) => {
    const scenario: DustScenario = {
      id: "selected-scenario", locationId: "jezero", source: "modeled", startLs: 0,
      frames: [], sourceRecords: [], assumptions: [],
      uncertainty: { spatialRadiusKm: 1, opacityRange: [0.1, 0.2], confidence },
    };
    const html = renderToStaticMarkup(createElement(HazardScenarioPanel, {
      selection: { status: "modeled", scenarios: [scenario] }, frame: null,
      state: { ...initialSimulationState, scenarioId: scenario.id },
      loading: false, disabled: false, playbackAvailable: true, onCommand: () => {},
    }));

    const provenance = html.match(/<details class="simulation-provenance">([\s\S]*?)<\/details>/)?.[1];
    expect(provenance).toContain(`Confidence: ${confidence}`);
  });
});
