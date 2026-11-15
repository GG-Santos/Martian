import { ArrowLeft } from "lucide-react";
import { Button } from "../../components/ui/button";
import type { RoomSnapshot } from "../session/protocol";
import type { WalkTimeline, sampleWalk } from "./marswalk-simulation";
import { ModelNotes } from "./MarswalkModelNotes";

export function MarswalkResults({
  room,
  run,
  sample,
  reset,
}: {
  room: RoomSnapshot;
  run: { timeline: WalkTimeline; aborted: boolean };
  sample: ReturnType<typeof sampleWalk>;
  reset: () => void;
}) {
  const failed = run.aborted || !sample.success;
  return (
    <section className="walk-results" aria-label="Expedition results">
      <div className="walk-result-story">
        <span className={`walk-outcome ${failed ? "is-failure" : ""}`}>
          {run.aborted
            ? "Simulation aborted"
            : sample.exhausted
              ? "Resources exhausted"
              : sample.success
                ? "Mission accomplished"
                : "Return reserve breached"}
        </span>
        <h2>
          {run.aborted
            ? "The expedition ended before return."
            : sample.exhausted
              ? "The crew could not complete the return."
              : sample.success
                ? "The crew is back at the habitat."
                : "Back at base, with too little margin."}
        </h2>
        <p>
          {sample.success
            ? "Your route connected the science stops and protected the crew’s return reserve. Review the field record, then try a more ambitious traverse."
            : "Use this rehearsal to change the plan before the next departure. Resource depletion is part of the mission, including every minute spent collecting science."}
        </p>
        <Button onClick={reset}>
          <ArrowLeft size={16} /> Revise the plan
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const report = {
              mission: room.mission!.title,
              crew: room.members.map((m) => ({
                name: m.name,
                role: m.role,
                isBot: !!m.isBot,
              })),
              outcome: run.aborted
                ? "aborted"
                : sample.success
                  ? "success"
                  : "failed",
              ...sample,
              activities: run.timeline.actions,
              model:
                "Educational EVA simulation; archival terrain, seeded hazards, illustrative resource rates",
            };
            const url = URL.createObjectURL(
              new Blob([JSON.stringify(report, null, 2)], {
                type: "application/json",
              }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = "marswalk-report.json";
            a.click();
            window.setTimeout(() => URL.revokeObjectURL(url), 1000);
          }}
        >
          Save field report
        </Button>
      </div>
      <div className="walk-result-data">
        <h3>Field record</h3>
        <dl>
          <div>
            <dt>Mission time</dt>
            <dd>{sample.elapsedMin.toFixed(1)} min</dd>
          </div>
          <div>
            <dt>Ground covered</dt>
            <dd>{Math.round(sample.distanceM)} m</dd>
          </div>
          <div>
            <dt>Science stops completed</dt>
            <dd>
              {sample.completed.length} / {run.timeline.objectiveCount}
            </dd>
          </div>
          <div>
            <dt>Oxygen remaining</dt>
            <dd>{sample.oxygen.toFixed(1)}%</dd>
          </div>
          <div>
            <dt>Battery remaining</dt>
            <dd>{sample.battery.toFixed(1)}%</dd>
          </div>
          <div>
            <dt>Returned to habitat</dt>
            <dd>{sample.returned && !run.aborted ? "Yes" : "No"}</dd>
          </div>
        </dl>
        <h3>For the next Marswalk</h3>
        <ul>
          {!sample.reserve && (
            <li>
              Reduce fieldwork or optional detours to preserve at least 20%
              oxygen and battery at return.
            </li>
          )}
          {run.aborted && (
            <li>
              Resume a new rehearsal and complete the return leg before
              assessing mission success.
            </li>
          )}
          <li>
            Compare the efficient and lower exposure routes against the hazard
            footprints.
          </li>
          <li>
            Inspect thermal brightness and slope before committing to the next
            science stop.
          </li>
          <li>
            {sample.completed.length < run.timeline.objectiveCount
              ? "Prioritize the primary objective before adding more fieldwork."
              : "All planned observations were rehearsed. Actual science still needs human observations and measurements."}
          </li>
        </ul>
        <details>
          <summary>Simulation model and sources</summary>
          <ModelNotes />
        </details>
      </div>
    </section>
  );
}
