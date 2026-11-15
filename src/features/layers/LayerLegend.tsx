import { type ColorStop, type AnalysisMode } from "../terrain/terrain-style";

export function LayerLegend({
  mode,
  stops,
}: {
  mode: Exclude<AnalysisMode, "none">;
  stops: ColorStop[];
}) {
  const min = stops[0].value;
  const range = Math.max(1, stops[stops.length - 1].value - min);
  const gradient = stops
    .map((stop) => `${stop.color} ${((stop.value - min) / range) * 100}%`)
    .join(", ");
  const title =
    mode === "slope"
      ? "Slope (°)"
      : mode === "thermal"
        ? "Relative IR brightness (DN)"
        : "Elevation (m)";
  return (
    <div className="layer-legend" role="group" aria-label={title}>
      <p>{title}</p>
      <div
        className="legend-ramp"
        style={{
          background: `linear-gradient(90deg in srgb-linear, ${gradient})`,
        }}
      />
      <div className="legend-extents">
        {stops.map((stop, index) => (
          <span key={index}>
            {mode === "elevation"
              ? stop.value.toFixed(1)
              : Math.round(stop.value)}
            {mode === "slope" ? (index === 3 ? "°+" : "°") : ""}
          </span>
        ))}
      </div>
      {mode === "slope" && <p>15° demo caution threshold</p>}
      {mode === "elevation" && <p>Meters above Mars 2000 datum</p>}
    </div>
  );
}
