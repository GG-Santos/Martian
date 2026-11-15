import { it, expect } from "vitest";
import { makeRouteExport } from "./export-route";
import { createRouteState } from "./route-state";
import type { MissionData } from "../mission/types";
import mission from "../../../public/data/jezero/mission.json";
import manifest from "../../../public/data/jezero/manifest.json";
it("exports versioned coordinates provenance assumptions and the return leg", () => {
  const m = { ...mission, manifest } as unknown as MissionData;
  const state = createRouteState(m.presetNodes);
  state.includedStopIds = ["A", "C"];
  const exported = JSON.parse(
    JSON.stringify(
      makeRouteExport(m, state, {
        distanceM: 200,
        ascentM: 10,
        durationMin: 30,
        remainingMin: 90,
        samples: [],
      }),
    ),
  );
  expect(exported.schemaVersion).toBe(1);
  expect(exported.datasetId).toBe(manifest.datasetId);
  expect(exported.coordinateReference.sourceCrs).toBe(manifest.sourceCrs);
  expect(exported.nodes.map((n: { kind: string }) => n.kind)).toEqual([
    "start",
    "stop",
    "stop",
    "end",
  ]);
  expect(exported.includedStopIds).toEqual(["A", "C"]);
  expect(exported.assumptions.speedMps).toBe(0.5);
  expect(exported.summary.distanceM).toBe(200);
  expect(exported.provenance).toHaveLength(3);
});
