import type { AnalysisMode } from "../terrain/terrain-style";

export type LayerSettings = {
  optical: { visible: boolean; opacity: number };
  analysis: AnalysisMode;
  analysisOpacity: number;
};

export const initialLayers: LayerSettings = {
  optical: { visible: false, opacity: 1 },
  analysis: "none",
  analysisOpacity: 0.8,
};

export function updateOptical(
  state: LayerSettings,
  patch: Partial<LayerSettings["optical"]>,
): LayerSettings {
  const opacity =
    patch.opacity === undefined || !Number.isFinite(patch.opacity)
      ? state.optical.opacity
      : Math.max(0, Math.min(1, patch.opacity));
  return { ...state, optical: { ...state.optical, ...patch, opacity } };
}

export function selectAnalysis(
  state: LayerSettings,
  mode: AnalysisMode,
): LayerSettings {
  return { ...state, analysis: state.analysis === mode ? "none" : mode };
}
