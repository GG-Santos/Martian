import type { RouteSummary, Assumptions } from "../mission/types";
import { Clock3, Footprints, Mountain, ArrowUpRight } from "lucide-react";
export function MissionSummary({
  summary,
  assumptions,
}: {
  summary: RouteSummary;
  assumptions: Assumptions;
}) {
  const over = summary.remainingMin < 0;
  return (
    <section className="summary" aria-label="Excursion estimates">
      <div className="summary-top">
        <h2>Excursion overview</h2>
        <span className={over ? "status-over" : "status-budget"}>
          {over ? "Over time allowance" : "Within time allowance"}
        </span>
      </div>
      <div className="metric-grid">
        <div>
          <Footprints size={16} />
          <strong data-testid="distance">
            {(summary.distanceM / 1000).toFixed(2)} <small>km</small>
          </strong>
          <span>Round trip</span>
        </div>
        <div>
          <Mountain size={16} />
          <strong>
            {Math.round(summary.ascentM)} <small>m</small>
          </strong>
          <span>Total ascent</span>
        </div>
        <div>
          <Clock3 size={16} />
          <strong data-testid="duration">
            {Math.round(summary.durationMin)} <small>min</small>
          </strong>
          <span>Estimated duration</span>
        </div>
        <div>
          <ArrowUpRight size={16} />
          <strong className={over ? "amber" : ""}>
            {Math.abs(Math.round(summary.remainingMin))} <small>min</small>
          </strong>
          <span>{over ? "Over allowance" : "Time remaining"}</span>
        </div>
      </div>
      <p className="estimate-note">
        {assumptions.speedMps} m/s walk · {assumptions.dwellMin} min per stop ·{" "}
        {assumptions.allowanceMin} min allowance
      </p>
    </section>
  );
}
