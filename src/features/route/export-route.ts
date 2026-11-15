import type { MissionData, RouteState, RouteSummary } from "../mission/types";
import { resolveNodes } from "./route-state";
export function makeRouteExport(
  mission: MissionData,
  state: RouteState,
  summary: RouteSummary,
) {
  return {
    schemaVersion: 1 as const,
    datasetId: mission.datasetId,
    coordinateReference: {
      axes: "east/north meters",
      sourceCrs: mission.manifest.sourceCrs,
      localTransform: mission.manifest.localTransform,
    },
    nodes: resolveNodes(state),
    includedStopIds: ["A", "B", "C"].filter((id) =>
      state.includedStopIds.includes(id as "A" | "B" | "C"),
    ),
    assumptions: state.assumptions,
    summary: {
      distanceM: summary.distanceM,
      ascentM: summary.ascentM,
      durationMin: summary.durationMin,
      remainingMin: summary.remainingMin,
    },
    provenance: mission.manifest.layers.map((l) => ({
      productId: l.productId,
      mission: l.mission,
      reference: l.reference,
    })),
    disclaimer:
      "Educational planning demonstration. Not a validated astronaut navigation or spacesuit model.",
  };
}
export type RouteExportV1 = ReturnType<typeof makeRouteExport>;
export function downloadRoute(data: RouteExportV1) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = "jezero-marswalk.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
