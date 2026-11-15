import { useState } from "react";
import { Flag, Check, NotebookPen } from "lucide-react";
import type { MissionData, StopId, RouteNode, Assumptions } from "./types";
import { objectives } from "./expedition-objectives";
import {
  loadJournal,
  saveJournal,
  type QuestJournalState,
} from "./quest-journal";
import { returnWalkMinutes } from "../route/return-walk";
import { inspectTerrain } from "../terrain/inspect-terrain";
import { TerrainReadout } from "../terrain/TerrainReadout";
import { ContextImage } from "./SciencePanel";
export function QuestJournal({
  mission,
  selectedStopId,
  includedStopIds,
  onSelect,
  onInclude,
  nodes,
  assumptions,
  thermal,
}: {
  thermal: Uint8Array | null;
  mission: MissionData;
  selectedStopId: StopId;
  includedStopIds: StopId[];
  onSelect: (id: StopId) => void;
  onInclude: (id: StopId, include: boolean) => void;
  nodes: RouteNode[];
  assumptions: Assumptions;
}) {
  const [journal, setJournal] = useState<QuestJournalState>(() => {
    try {
      return loadJournal(window.localStorage, mission.datasetId);
    } catch {
      return {};
    }
  });
  const [saved, setSaved] = useState(true);
  const stop = mission.stops.find((s) => s.id === selectedStopId)!;
  const objective = objectives.find((o) => o.stopId === selectedStopId)!;
  const entry = journal[stop.id] ?? { reviewed: false, note: "" };
  const remaining = returnWalkMinutes(nodes, stop.id, assumptions.speedMps);
  function update(next: QuestJournalState) {
    setJournal(next);
    try {
      setSaved(saveJournal(window.localStorage, mission.datasetId, next));
    } catch {
      setSaved(false);
    }
  }
  return (
    <section className="quest-journal" aria-label="Expedition journal">
      <div className="quest-section-heading">
        <h2>
          <NotebookPen size={16} /> Expedition journal
        </h2>
        <span>
          {Object.values(journal).filter((e) => e?.reviewed).length}/3 reviewed
        </span>
      </div>
      <p className="fine">
        Hypothetical field objectives · Progress saved on this device
      </p>
      <div className="quest-list" role="group" aria-label="Science stops">
        {objectives.map((o) => {
          const site = mission.stops.find((s) => s.id === o.stopId)!;
          return (
            <button
              key={o.stopId}
              aria-label={`${site.id} ${site.title}`}
              aria-pressed={stop.id === o.stopId}
              onClick={() => onSelect(o.stopId)}
            >
              <span className={`quest-symbol ${o.priority}`}>
                {journal[o.stopId]?.reviewed ? <Check size={13} /> : o.stopId}
              </span>
              <span>
                <small>
                  {o.priority} objective ·{" "}
                  {includedStopIds.includes(o.stopId)
                    ? "On route"
                    : "Off route"}
                </small>
                <strong>{o.title}</strong>
              </span>
            </button>
          );
        })}
      </div>
      <div className="quest-brief" key={stop.id}>
        <span className="quest-eyebrow">
          <Flag size={12} /> SITE {stop.id} / {objective.priority} objective
        </span>
        <h3>{objective.title}</h3>
        <p>{objective.why}</p>
        <dl className="quest-stats">
          <div>
            <dt>Local coordinates</dt>
            <dd>
              {stop.point.x} E / {stop.point.y} N m
            </dd>
          </div>
          <div>
            <dt>Science dwell</dt>
            <dd>{assumptions.dwellMin} min</dd>
          </div>
          <div>
            <dt>Return walk</dt>
            <dd>
              {remaining === null
                ? "Not on planned route"
                : `${remaining.toFixed(0)} min along remaining route`}
            </dd>
          </div>
        </dl>
        <TerrainReadout
          reading={inspectTerrain(stop.point, mission.grid, thermal)}
        />
        <p className="fine">Return walk excludes later science dwell.</p>
        <label className="include-stop">
          <input
            type="checkbox"
            aria-label={`Include stop ${stop.id}`}
            checked={includedStopIds.includes(stop.id)}
            onChange={(e) => onInclude(stop.id, e.target.checked)}
          />{" "}
          Include this science stop
        </label>
        <button
          className="quest-route-action"
          onClick={() => onInclude(stop.id, !includedStopIds.includes(stop.id))}
        >
          {includedStopIds.includes(stop.id)
            ? "Remove from route"
            : "Add to route"}
        </button>
        <button
          className="quest-review"
          aria-pressed={entry.reviewed}
          onClick={() =>
            update({
              ...journal,
              [stop.id]: { ...entry, reviewed: !entry.reviewed },
            })
          }
        >
          {entry.reviewed ? "Reviewed" : "Mark reviewed"}
          <Check size={13} />
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            update({ ...journal, [stop.id]: entry });
          }}
        >
          <label htmlFor="quest-note">Observation at site {stop.id}</label>
          <textarea
            id="quest-note"
            maxLength={500}
            value={entry.note}
            placeholder="Record texture, material, or a question…"
            onChange={(e) =>
              setJournal({
                ...journal,
                [stop.id]: { ...entry, note: e.target.value },
              })
            }
          />
          <div className="quest-note-actions">
            <small>{entry.note.length}/500</small>
            <button type="submit">Log observation</button>
          </div>
        </form>
        <p className="fine" role="status">
          {saved
            ? "Journal stays separate from your itinerary."
            : "Could not save on this device. Notes remain in this session."}
        </p>
        <details className="quest-evidence">
          <summary>Science question & evidence</summary>
          <h4>{stop.question}</h4>
          <p>{stop.context}</p>
          <ContextImage key={stop.id} stop={stop} />
          {stop.references.map((link, i) => (
            <a href={link} key={link} target="_blank" rel="noreferrer">
              {i === 0 ? "Jezero science context" : "HiRISE terrain source"} ↗
            </a>
          ))}
        </details>
      </div>
      <button className="quest-reset" onClick={() => update({})}>
        Reset journal
      </button>
    </section>
  );
}
