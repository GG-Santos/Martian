"use client";

import Link from "next/link";

import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button";
import { useRoom } from "../session/RoomProvider";
import { assessProximity, type ProximityAssessment } from "../crew/proximity";
import type { Quest } from "../quests/quest-types";
import type { LiveMarker } from "./LiveMissionOverlay";

const percent = (value: number) => value >= 100 ? "100" : Math.min(99.9, value).toFixed(1);

export function LiveMissionPanel({ optionalObjectives, selectedMarker, onSelectMarker, onWarning, radiusM, onRadius, radiation, onRadiation }: {
  optionalObjectives: Quest[];
  selectedMarker: LiveMarker | null;
  onSelectMarker: (marker: LiveMarker) => void;
  onWarning: (warning: boolean) => void;
  radiusM: number;
  onRadius: (radius: number) => void;
  radiation: boolean;
  onRadiation: (active: boolean) => void;
}) {
  const { snapshot, memberId, connection, error, send, setExpeditionPlan, restoringRoom } = useRoom();
  const prior = useRef<ProximityAssessment | undefined>(undefined);
  const [assessment, setAssessment] = useState<ProximityAssessment | null>(null);
  const current = memberId ? snapshot?.positions[memberId] : null;
  const members = snapshot?.members ?? [];
  const positions = snapshot?.positions;
  useEffect(() => {
    if (!snapshot || snapshot.status !== "launched") { prior.current = undefined; return; }
    const next = assessProximity(snapshot.members.map((member) => ({ id: member.id, point: snapshot.positions[member.id] })), radiusM, prior.current);
    prior.current = next;
    const frame = requestAnimationFrame(() => setAssessment(next));
    onWarning(next.warning);
    return () => cancelAnimationFrame(frame);
  }, [snapshot, onWarning, radiusM]);
  const selectedQuest = selectedMarker?.kind === "quest"
    ? snapshot?.mission?.id === selectedMarker.id ? snapshot.mission : snapshot?.quests.find((quest) => quest.id === selectedMarker.id)
    : null;
  const canUpdateTask = selectedQuest && snapshot?.quests.some((quest) => quest.id === selectedQuest.id);
  function questCommand(type: "quest-accept" | "quest-start") {
    if (!snapshot || !selectedQuest || !memberId) return;
    if (type === "quest-accept") send({ type, code: snapshot.code, expectedRevision: snapshot.revision, questId: selectedQuest.id, memberIds: snapshot.members.map((member) => member.id) });
    else send({ type, code: snapshot.code, expectedRevision: snapshot.revision, questId: selectedQuest.id });
  }
  function addSelectedObjective() {
    if (!snapshot || !selectedQuest || connection !== "online" || restoringRoom) return;
    const plan = snapshot.expeditionPlan;
    if (plan.optionalObjectiveIds.includes(selectedQuest.id)) return;
    setExpeditionPlan(snapshot.code, snapshot.revision, { ...plan, optionalObjectiveIds: [...plan.optionalObjectiveIds, selectedQuest.id] });
  }
  function moveBy(dx: number, dy: number) {
    if (!snapshot || !current || !memberId || connection !== "online") return;
    send({ type: "move", code: snapshot.code, expectedRevision: snapshot.revision, point: { x: Math.max(0, Math.min(2048, current.x + dx)), y: Math.max(0, Math.min(2048, current.y + dy)) } });
  }
  if (!snapshot) return <section className="live-mission-panel"><h2>Live expedition</h2><p>Start a solo crew or join teammates from Mission Command to synchronize field tasks.</p><Link href="/">Mission Command</Link></section>;
  if (snapshot.status !== "launched") return <section className="live-mission-panel"><h2>Crew {snapshot.code}</h2><p>Finish preparation and launch from Mission Command.</p><Link href="/">Mission Command</Link></section>;
  return <section className="live-mission-panel" aria-label="Live expedition">
    <div className="live-mission-header"><div><small>LIVE CREW / {snapshot.code}</small><h2>Field coordination</h2></div><span className={`live-connection ${connection}`}>{connection}</span></div>
    {error && <p role="alert" className="action-error">{error}</p>}
    <section className="live-field-status" aria-label="Field status">
      <div><span>CREW</span><strong>{members.length} / {snapshot.capacity}</strong><small>On the surface</small></div>
      <div><span>SUIT O₂</span><strong>{snapshot.resources[memberId ?? ""] ? `${snapshot.resources[memberId ?? ""].oxygen.toFixed(1)}%` : "—"}</strong><small>Simulated balance</small></div>
      <div><span>STAMINA</span><strong>{snapshot.resources[memberId ?? ""] ? `${snapshot.resources[memberId ?? ""].stamina.toFixed(1)}%` : "—"}</strong><small>Simulated balance</small></div>
      <div><span>ACTIVE TASKS</span><strong>{snapshot.quests.filter((quest) => quest.status === "accepted" || quest.status === "in-progress").length}</strong><small>Shared in this crew</small></div>
      <div className={assessment?.warning ? "alert" : ""}><span>CREW NETWORK</span><strong>{assessment?.warning ? "SEPARATED" : "CONNECTED"}</strong><small>{radiusM} m policy · simulated</small></div>
    </section>
    <label className="live-radius">Crew network radius <select aria-label="Crew proximity radius" value={radiusM} onChange={(event) => onRadius(Number(event.target.value))}><option value="25">25 m</option><option value="50">50 m</option><option value="100">100 m</option></select></label>
    {assessment?.warning && <div className="live-proximity-warning" role="alert"><strong>Crew separation · {assessment.components.length > 1 ? "warning" : "position unknown"}</strong><span>{assessment.components.length > 1 ? `${assessment.components.length} crew clusters; ${members.map((member) => member.name).join(", ")} affected.` : `Position unavailable for ${assessment.missingIds.map((id) => members.find((member) => member.id === id)?.name ?? id).join(", ")}.`} Connected-network limit {radiusM} m with {assessment.hysteresisM} m hysteresis.</span></div>}
    <div className="live-member-list">{members.map((member) => {
      const point = positions?.[member.id];
      const nearest = point ? Math.min(...members.filter((other) => other.id !== member.id && positions?.[other.id]).map((other) => Math.hypot(point.x - positions![other.id].x, point.y - positions![other.id].y))) : Infinity;
      const resource = snapshot.resources[member.id];
      return <button type="button" key={member.id} className={assessment?.warning && nearest > radiusM ? "separated" : ""} onClick={() => point && onSelectMarker({ id: member.id, kind: "member", label: member.name, point })}>
        <span className="live-member-dot" /><span>{member.name}{member.id === memberId ? " · you" : ""}</span><small>{point ? `${Math.round(point.x)} E / ${Math.round(point.y)} N${Number.isFinite(nearest) ? ` · nearest ${Math.round(nearest)} m` : ""}` : "Position unknown"}</small><small>{resource ? `O₂ ${percent(resource.oxygen)}% · stamina ${percent(resource.stamina)}% · kit ${resource.equipment.join(", ") || "none"}` : "Resources pending"}</small>
      </button>;
    })}</div>
    <section className="live-environment" aria-label="Simulated environment">
      <div className="live-environment-heading"><strong>Simulated environment</strong><small>Local radiation exercise</small></div>
      <div className="live-environment-grid">
        <div><span>Radiation index</span><strong>{radiation ? "ELEVATED" : "BASELINE"}</strong><small>{radiation ? "Scenario index 7 / 10" : "Scenario index 2 / 10"}</small></div>
      </div>
      <div className="live-environment-actions">
        <button type="button" aria-pressed={radiation} onClick={() => onRadiation(!radiation)}>{radiation ? "Clear radiation scenario" : "Simulate radiation rise"}</button>
      </div>
      {radiation && <p role="alert" className="live-radiation-alert">Illustrative elevated radiation: pause field travel for review. Route estimates do not model radiation dose.</p>}
    </section>
    <div className="live-movement"><strong>Move your astronaut</strong><small>Requested 10 m steps. Server limits actual motion to 2 m/s and subtracts simulated resources.</small><div><Button size="sm" variant="outline" onClick={() => moveBy(0, 10)} disabled={!current || connection !== "online"}>North</Button><Button size="sm" variant="outline" onClick={() => moveBy(-10, 0)} disabled={!current || connection !== "online"}>West</Button><Button size="sm" variant="outline" onClick={() => moveBy(10, 0)} disabled={!current || connection !== "online"}>East</Button><Button size="sm" variant="outline" onClick={() => moveBy(0, -10)} disabled={!current || connection !== "online"}>South</Button></div></div>
    <div className="live-quests-heading"><strong>Field tasks</strong><small>{snapshot.quests.filter((quest) => ["published", "accepted", "in-progress"].includes(quest.status)).length} on map</small></div>
    <div className="live-quest-list">{snapshot.quests.filter((quest) => ["published", "accepted", "in-progress"].includes(quest.status)).map((quest) => <button type="button" key={quest.id} onClick={() => onSelectMarker({ id: quest.id, kind: "quest", label: quest.title, point: quest.point })} aria-pressed={selectedQuest?.id === quest.id}><span>{quest.title}</span><small>{quest.status}</small></button>)}</div>
    {selectedMarker && <div className="live-selection"><small>MAP SELECTION · {selectedMarker.kind.toUpperCase()}</small><h3>{selectedMarker.label}</h3><p>{Math.round(selectedMarker.point.x)} E / {Math.round(selectedMarker.point.y)} N m</p>
      {selectedQuest && <><p>{selectedQuest.description}</p><p className="fine">{selectedQuest.provenance}</p>{canUpdateTask && selectedQuest.status === "published" && <Button size="sm" onClick={() => questCommand("quest-accept")}>Accept for crew</Button>}{canUpdateTask && selectedQuest.status === "accepted" && <Button size="sm" onClick={() => questCommand("quest-start")}>Start task</Button>}</>}
      {selectedQuest && optionalObjectives.some(({ id }) => id === selectedQuest.id)
        && !snapshot.expeditionPlan.optionalObjectiveIds.includes(selectedQuest.id)
        && <Button size="sm" onClick={addSelectedObjective} disabled={connection !== "online" || restoringRoom}>Add to shared plan</Button>}
    </div>}
  </section>;
}
