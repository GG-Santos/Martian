import {
  AlertTriangle,
  Focus,
  CloudFog,
  Mountain,
  ScanSearch,
} from "lucide-react";
import type { Hazard, HazardCategory } from "./hazard-types";
export const hazardCategories: { id: HazardCategory; label: string }[] = [
  { id: "slope", label: "Steep slopes" },
  { id: "depression", label: "Crater / depression" },
  { id: "sand", label: "Loose sand" },
  { id: "rockfall", label: "Rockfall zones" },
  { id: "dust", label: "Dust storm" },
];
export function HazardPanel({
  hazards,
  selectedId,
  onSelect,
  conflicts,
  dust,
  onDust,
  visible,
  onVisible,
  filters,
  onFilter,
  unavailable,
  onFocus,
}: {
  hazards: Hazard[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  conflicts: { team: string; hazardId: string; legIndexes: number[] }[];
  dust: boolean;
  onDust?: (value: boolean) => void;
  visible: boolean;
  onVisible: (value: boolean) => void;
  filters: HazardCategory[];
  onFilter: (id: HazardCategory) => void;
  unavailable: boolean;
  onFocus: () => void;
}) {
  const selected = hazards.find((h) => h.id === selectedId);
  return (
    <section className="hazard-panel">
      <h2>
        <AlertTriangle size={21} /> Route hazards
      </h2>
      <p className="fine">
        Archived terrain screening and labeled planning scenarios.
      </p>
      <label className="atlas-toggle">
        <input
          type="checkbox"
          checked={visible}
          onChange={(e) => onVisible(e.target.checked)}
        />{" "}
        Show hazard map
      </label>
      {onDust && <label className="atlas-toggle">
        <input
          aria-label="Dust-storm scenario"
          type="checkbox"
          checked={dust}
          onChange={(e) => onDust(e.target.checked)}
        />
        <CloudFog size={15} /> Enable dust-storm scenario
      </label>}
      <div className="hazard-filters" aria-label="Hazard category filters">
        {hazardCategories.map((c) => (
          <button
            key={c.id}
            aria-pressed={filters.includes(c.id)}
            onClick={() => onFilter(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <p className="hazard-summary" role="status">
        {new Set(conflicts.map((c) => c.hazardId)).size} zones intersect planned
        routes
      </p>
      {unavailable && (
        <p className="fine">
          Scenario annotations unavailable. Terrain-derived slope warnings
          remain available.
        </p>
      )}
      <div className="hazard-list">
        {hazards
          .filter((h) => filters.includes(h.category))
          .map((h) => (
            <button
              key={h.id}
              aria-pressed={selectedId === h.id}
              onClick={() => onSelect(h.id)}
            >
              <AlertTriangle size={17} />
              <span>
                <strong>{h.title}</strong>
                <small>
                  {h.evidence} ·{" "}
                  {conflicts.some((c) => c.hazardId === h.id)
                    ? "Route conflict"
                    : "Outside route"}
                </small>
              </span>
            </button>
          ))}
      </div>
      {selected ? (
        <div className="hazard-detail">
          <h3>{selected.title}</h3>
          <div className="hazard-evidence">
            <ScanSearch size={13} />
            {selected.evidence} · {selected.severity}
          </div>
          <p>{selected.description}</p>
          {selected.slopeRangeDeg && (
            <p>
              <Mountain size={13} /> {selected.slopeRangeDeg[0].toFixed(1)}–
              {selected.slopeRangeDeg[1].toFixed(1)}° · 8 m analysis
            </p>
          )}
          <h4>Potential risks</h4>
          <ul>
            {selected.risks.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <h4>Planning precautions</h4>
          <ul>
            {selected.precautions.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          {selected.communicationsNote && (
            <p className="communications-note">{selected.communicationsNote}</p>
          )}
          <h4>Affected legs</h4>
          {conflicts
            .filter((c) => c.hazardId === selected.id)
            .map((c) => (
              <p key={c.team}>
                Team {c.team} · legs {c.legIndexes.map((i) => i + 1).join(", ")}
              </p>
            ))}
          {!conflicts.some((c) => c.hazardId === selected.id) && (
            <p>No intersection with either planned route.</p>
          )}
          <button className="hazard-focus" onClick={onFocus}>
            <Focus size={14} /> Focus hazard
          </button>
          {selected.sources.map((source, i) => (
            <a key={source} href={source} target="_blank" rel="noreferrer">
              {i === 0
                ? "Terrain / evidence source"
                : "Planning context source"}{" "}
              ↗
            </a>
          ))}
        </div>
      ) : (
        <p className="fine">Select a red map warning or a hazard above.</p>
      )}
    </section>
  );
}
