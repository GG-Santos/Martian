import { useRef } from "react";
import {
  Info,
  House,
  UserRound,
  Flag,
  MapPin,
  AlertTriangle,
  X,
} from "lucide-react";
export function MapLegend() {
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        className="legend-trigger"
        ref={trigger}
        popoverTarget="map-legend"
      >
        <Info size={14} /> Legend
      </button>
      <aside id="map-legend" popover="auto" className="map-legend">
        <div className="legend-heading">
          <h2>Map symbols</h2>
          <button
            aria-label="Close map legend"
            onClick={() => {
              document.getElementById("map-legend")?.hidePopover();
              trigger.current?.focus();
            }}
          >
            <X size={16} />
          </button>
        </div>
        <dl>
          <div>
            <dt>
              <House size={17} /> HAB
            </dt>
            <dd>Hypothetical habitat and communications dish.</dd>
          </div>
          <div>
            <dt>
              <UserRound size={17} /> A1–B2
            </dt>
            <dd>
              Simulated crew. Figures and habitat are enlarged map symbols.
            </dd>
          </div>
          <div>
            <dt>
              <Flag size={17} /> A / B / C
            </dt>
            <dd>Main and optional science objectives.</dd>
          </div>
          <div>
            <dt>
              <MapPin size={17} /> W
            </dt>
            <dd>Editable route waypoint.</dd>
          </div>
          <div>
            <dt>
              <AlertTriangle size={17} /> Red warning
            </dt>
            <dd>
              Selectable hazard zone. Evidence is labeled Terrain-derived,
              Reviewed scenario or Scenario event.
            </dd>
          </div>
        </dl>
        <div className="scenario-hazard-key" aria-label="Crew scenario hazard colors">
          <strong>Crew scenario colors</strong>
          {(["heat", "dust", "chemical", "radiation", "rockfall", "storm"] as const).map((kind) => (
            <span key={kind}>
              <i className={`scenario-hazard-swatch scenario-hazard-swatch--${kind}`} aria-hidden="true" />
              {kind[0].toUpperCase() + kind.slice(1)}
            </span>
          ))}
        </div>
        <p>
          Alpha uses mint and a solid trail. Bravo uses amber and a dashed
          trail.
        </p>
        <p>
          15° is an illustrative slope warning threshold. Hazard filters control
          map visibility while route conflicts stay available.
        </p>
      </aside>
    </>
  );
}
