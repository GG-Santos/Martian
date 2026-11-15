import { Navigation, UserRound, MapPin, Radio } from "lucide-react";
import type { CrewId, CrewState, TeamTimeline } from "./crew-timeline";
export function CrewPanel({
  states,
  timelines,
  selectedId,
  followId,
  onSelect,
  onFollow,
  warnings = [],
}: {
  states: CrewState[];
  timelines: TeamTimeline[];
  selectedId: CrewId;
  followId: CrewId | null;
  onSelect: (id: CrewId) => void;
  onFollow: (id: CrewId | null) => void;
  warnings?: string[];
}) {
  const selected = states.find((s) => s.member.id === selectedId)!;
  return (
    <section className="crew-panel">
      <h2>Surface crew</h2>
      <p className="fine">Four simulated explorers · Two buddy teams</p>
      {timelines.map((team) => (
        <div className={`crew-team ${team.teamId}`} key={team.teamId}>
          <h3>Team {team.teamId}</h3>
          <p className="team-itinerary">
            {team.nodes
              .map((n) =>
                n.kind === "start" || n.kind === "end"
                  ? "HAB"
                  : (n.stopId ?? "W"),
              )
              .join(" → ")}
          </p>
          {states
            .filter((s) => s.member.teamId === team.teamId)
            .map((s) => (
              <button
                key={s.member.id}
                aria-label={`Select crew ${s.member.id} ${s.member.name}`}
                aria-pressed={selectedId === s.member.id}
                onClick={() => onSelect(s.member.id)}
              >
                <span className="crew-id">
                  <UserRound size={15} />
                  {s.member.id}
                </span>
                <span>
                  <strong>{s.member.name}</strong>
                  <small>{s.member.role}</small>
                </span>
                <span className="crew-activity">{s.activity}</span>
              </button>
            ))}
        </div>
      ))}
      <div className="crew-detail">
        <h3>
          {selected.member.name} <span>{selected.member.id}</span>
        </h3>
        <dl className="quest-stats">
          <div>
            <dt>
              <MapPin size={12} /> Coordinates
            </dt>
            <dd data-testid="crew-coordinates">
              {selected.point.x.toFixed(1)} E / {selected.point.y.toFixed(1)} N
              m
            </dd>
          </div>
          <div>
            <dt>Activity</dt>
            <dd>
              {selected.activity}
              {selected.stopId ? ` at ${selected.stopId}` : ""}
            </dd>
          </div>
          <div>
            <dt>Remaining walk + dwell</dt>
            <dd>{Math.ceil(selected.remainingSec / 60)} min</dd>
          </div>
          <div>
            <dt>Departure delay</dt>
            <dd>{selected.member.departureOffsetSec} mission sec</dd>
          </div>
        </dl>
        <button
          className="crew-follow"
          aria-pressed={followId === selectedId}
          onClick={() => onFollow(followId === selectedId ? null : selectedId)}
        >
          <Navigation size={14} />
          {followId === selectedId ? "Stop following" : "Follow crew"}
        </button>
        <h4>
          <Radio size={13} /> Current route warnings
        </h4>
        {warnings.length ? (
          warnings.map((w) => (
            <p className="crew-warning" key={w}>
              {w}
            </p>
          ))
        ) : (
          <p className="fine">No mapped zone at this coordinate.</p>
        )}
        <p className="fine">
          Crew figures are enlarged map symbols. Coordinates refer to their
          route anchors.
        </p>
      </div>
    </section>
  );
}
