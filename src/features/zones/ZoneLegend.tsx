import type { ZoneCell } from "./zone-types";

const classes = [
  ["safe", "Safe Zone", "Lower mapped slope; illustrative screening only"],
  ["caution", "Caution Zone", "Difficult terrain or reviewed caution"],
  ["hazard", "Hazard Zone", "Steep slope or mapped warning scenario"],
  ["unknown", "Unknown Zone", "No reliable terrain assessment"],
] as const;

export function ZoneLegend({ selected }: { selected: ZoneCell | null }) {
  return (
    <section className="zone-legend" role="region" aria-label="Terrain zones">
      <h2>Terrain zones</h2>
      <div className="zone-key">
        {classes.map(([id, title, detail]) => (
          <div key={id}>
            <i className={`zone-swatch ${id}`} aria-hidden="true" />
            <span><strong>{title}</strong><small>{detail}</small></span>
          </div>
        ))}
      </div>
      <p>Safe Zone is an illustrative slope screen, not certified astronaut safety. Unknown terrain stays unknown.</p>
      {selected && (
        <div className="zone-detail">
          <h3>Zone assessment</h3>
          <strong>{selected.label}</strong>
          <p>{selected.slopeDeg === null ? "Slope unavailable" : `${selected.slopeDeg.toFixed(1)}° mapped slope`} · {selected.center.x.toFixed(0)} E / {selected.center.y.toFixed(0)} N m</p>
          <ul>{selected.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          <p>{selected.evidence.map((entry) => entry.sourceClass).join(" · ") || "No source available"}</p>
        </div>
      )}
    </section>
  );
}
