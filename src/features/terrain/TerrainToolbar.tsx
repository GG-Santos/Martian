import { Maximize, Minimize, RotateCcw } from "lucide-react";
import type {
  ReliefScale,
  TerrainDisplay,
  TerrainMode,
} from "./terrain-display";

export function TerrainToolbar({
  view,
  display,
  onView,
  onDisplay,
  onReset,
  expanded,
  onExpand,
  inspecting,
  onInspect,
}: {
  inspecting: boolean;
  onInspect: () => void;
  view: "orbit" | "top";
  display: TerrainDisplay;
  onView: (view: "orbit" | "top") => void;
  onDisplay: (patch: Partial<TerrainDisplay>) => void;
  onReset: () => void;
  expanded: boolean;
  onExpand: () => void;
}) {
  return (
    <div className="map-toolbar scanner-toolbar">
      <div role="group" aria-label="Camera view">
        <button aria-pressed={view === "orbit"} onClick={() => onView("orbit")}>
          3D terrain
        </button>
        <button aria-pressed={view === "top"} onClick={() => onView("top")}>
          Top down
        </button>
        <button aria-label="Reset camera" onClick={onReset}>
          <RotateCcw size={14} />
        </button>
      </div>
      <div role="group" aria-label="Terrain representation">
        {(["surface", "physical", "mesh", "points"] as TerrainMode[]).map(
          (mode) => (
            <button
              key={mode}
              aria-pressed={display.mode === mode}
              onClick={() => onDisplay({ mode })}
            >
              {mode[0].toUpperCase() + mode.slice(1)}
            </button>
          ),
        )}
      </div>
      <div role="group" aria-label="Survey overlays">
        <button
          aria-pressed={display.grid}
          disabled={display.mode === "physical"}
          onClick={() => onDisplay({ grid: !display.grid })}
        >
          Grid
        </button>
        <button
          aria-pressed={display.contours}
          disabled={display.mode === "physical"}
          onClick={() => onDisplay({ contours: !display.contours })}
        >
          Contours
        </button>
        <label>
          Relief{" "}
          <select
            aria-label="Relief scale"
            value={display.scale}
            disabled={display.mode === "physical"}
            onChange={(event) =>
              onDisplay({ scale: Number(event.target.value) as ReliefScale })
            }
          >
            {[1, 3, 5].map((scale) => (
              <option key={scale} value={scale}>
                {scale}×
              </option>
            ))}
          </select>
        </label>
      </div>
      <button aria-pressed={inspecting} onClick={onInspect}>
        Inspect
      </button>
      <button
        className="scanner-expand"
        aria-label={expanded ? "Exit full screen" : "Full screen"}
        title={expanded ? "Exit full screen" : "Full screen"}
        onClick={onExpand}
      >
        {expanded ? <Minimize size={15} /> : <Maximize size={15} />}
      </button>
    </div>
  );
}
