import { Layers3 } from "lucide-react";
import type { LayerSettings } from "./layer-state";
import { LayerLegend } from "./LayerLegend";
import type { AnalysisMode, ColorStop } from "../terrain/terrain-style";

const overlays = [
  ["slope", "Terrain slope", "HiRISE · 8 m analysis"],
  ["elevation", "Elevation", "HiRISE · Mars 2000 datum"],
  ["thermal", "Thermal context", "THEMIS · ~100 m source"],
] as const;

export function LayerPanel({
  settings,
  colorStops,
  meshSpacing,
  opticalUnavailable,
  opticalLocked,
  availability,
  onOptical,
  onAnalysis,
  onOpacity,
}: {
  settings: LayerSettings;
  colorStops: ColorStop[];
  meshSpacing: number;
  opticalUnavailable: boolean;
  opticalLocked: boolean;
  availability: Record<"slope" | "thermal", boolean | undefined>;
  onOptical: (patch: Partial<LayerSettings["optical"]>) => void;
  onAnalysis: (mode: AnalysisMode) => void;
  onOpacity: (opacity: number) => void;
}) {
  return (
    <aside className="layer-panel scanner-layers">
      <h2>
        <Layers3 size={17} /> Map layers
      </h2>
      <section className="layer-item">
        <h3>Base surface</h3>
        <button
          className="layer-toggle"
          aria-pressed={settings.optical.visible}
          disabled={opticalLocked}
          onClick={() => onOptical({ visible: !settings.optical.visible })}
        >
          Optical imagery
        </button>
        <p className="layer-source">
          {opticalUnavailable
            ? "Optical imagery unavailable"
            : "HiRISE · ~1 m optical"}
        </p>
        {settings.optical.visible && !opticalUnavailable && !opticalLocked && (
          <label className="opacity-control">
            Opacity
            <input
              aria-label="Optical opacity"
              type="range"
              min="0"
              max="1"
              step=".05"
              value={settings.optical.opacity}
              onChange={(e) => onOptical({ opacity: Number(e.target.value) })}
            />
          </label>
        )}
      </section>
      <section className="layer-item">
        <h3>Analysis</h3>
        {overlays.map(([mode, title, source]) => {
          const available = mode === "elevation" ? true : availability[mode];
          return (
            <div className="scanner-layer-row" key={mode}>
              <button
                className="layer-toggle"
                disabled={!available}
                aria-pressed={settings.analysis === mode}
                onClick={() => onAnalysis(mode)}
              >
                {title}
              </button>
              <p className="layer-source">
                {available === undefined
                  ? "Loading samples…"
                  : available
                    ? mode === "elevation"
                      ? `HiRISE ~1 m source · ${meshSpacing} m mesh`
                      : source
                    : "Samples unavailable"}
              </p>
            </div>
          );
        })}
        {settings.analysis !== "none" && (
          <>
            <LayerLegend mode={settings.analysis} stops={colorStops} />
            <label className="opacity-control">
              Opacity
              <input
                aria-label="Analysis opacity"
                type="range"
                min="0"
                max="1"
                step=".05"
                value={settings.analysisOpacity}
                onChange={(e) => onOpacity(Number(e.target.value))}
              />
            </label>
          </>
        )}
      </section>
    </aside>
  );
}
