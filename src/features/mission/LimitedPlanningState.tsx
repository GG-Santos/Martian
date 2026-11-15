import type { RoomSnapshot } from "../session/protocol";
import type { MissionLocation } from "./mission-location";

export function LimitedPlanningState({ location, room }: {
  location: MissionLocation;
  room: RoomSnapshot;
}) {
  const tasks = room.quests.filter((quest) => quest.id !== room.mission?.id &&
    ["published", "accepted", "in-progress"].includes(quest.status));

  return (
    <section className="live-mission-panel" aria-labelledby="limited-planning-heading">
      <div className="live-mission-header">
        <div>
          <small>{location.name} · {location.provenance}</small>
          <h2 id="limited-planning-heading">Limited planning</h2>
        </div>
      </div>
      <p role="status">{location.coverage.reason} Terrain and route estimates are unavailable.</p>
      <section className="live-selection" aria-label="Shared expedition details">
        <small>LIVE CREW / {room.code}</small>
        <h3>{room.crewName}</h3>
        <dl>
          <dt>Crew base · simulated local coordinates</dt>
          <dd>{room.base ? `${room.base.x} E / ${room.base.y} N m` : "Base unavailable"}</dd>
          <dt>Selected mission</dt>
          <dd>{room.mission?.title ?? "Mission objective unavailable"}</dd>
        </dl>
        <h4>Crew members</h4>
        <ul>{room.members.map((member) => <li key={member.id}>{member.name}</li>)}</ul>
        <h4>Field tasks</h4>
        {tasks.length ? (
          <ul>{tasks.map((task) => <li key={task.id}>{task.title} · {task.status}</li>)}</ul>
        ) : <p>No additional field tasks.</p>}
      </section>
    </section>
  );
}
