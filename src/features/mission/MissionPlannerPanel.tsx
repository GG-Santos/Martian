import { useId } from "react";
import type { Quest } from "../quests/quest-types";
import type { MissionBudget, MissionBudgetAssumptions } from "../resources/mission-budget";
import type { ExpeditionPlan, RoomSnapshot } from "../session/protocol";
import { useRoom } from "../session/RoomProvider";
import { routePreferences, type PlannedRoute, type RoutePreference } from "./mission-plan";
import type { SiteCoverage } from "./types";
import type { Hazard } from "../hazards/hazard-types";
import { pointInHazard } from "../hazards/hazard-geometry";

const routeLabels = { efficient: "Efficient", "lower-exposure": "Lower exposure" };

export function MissionPlannerPanel({ room, plan, routes, budgets, assumptions, coverage, routeHazardStatus, optionalObjectives, dust, dustFrameAvailable }: {
  room: RoomSnapshot;
  plan: ExpeditionPlan;
  routes: PlannedRoute[];
  budgets: Record<RoutePreference, MissionBudget | null>;
  assumptions: MissionBudgetAssumptions;
  coverage: SiteCoverage;
  dust: Hazard | null;
  dustFrameAvailable: boolean;
  routeHazardStatus: string | null;
  optionalObjectives: Quest[];
}) {
  const headingId = useId();
  const { connection, restoringRoom, setExpeditionPlan } = useRoom();
  const { base, mission } = room;
  const disabled = connection !== "online" || restoringRoom;
  const coordinates = base ? Math.round(base.x) + " E / " + Math.round(base.y) + " N m" : "Base not set";
  const byId = new Map(optionalObjectives.map((objective) => [objective.id, objective]));
  const selectedBudget = budgets[plan.routePreference];
  const update = (change: Partial<ExpeditionPlan>) => {
    if (!disabled) setExpeditionPlan(room.code, room.revision, { ...plan, ...change });
  };
  function reorder(index: number, direction: -1 | 1) {
    const ids = [...plan.optionalObjectiveIds];
    const next = index + direction;
    if (next < 0 || next >= ids.length) return;
    [ids[index], ids[next]] = [ids[next], ids[index]];
    update({ optionalObjectiveIds: ids });
  }
  function objectiveAssessment(objective: Quest | undefined) {
    if (!objective || !dustFrameAvailable) return "Dust assessment unavailable";
    if (dust && pointInHazard(objective.point, dust)) return "Defer in this frame · within dust footprint";
    return "Available in this frame · clear of simulated dust";
  }
  return (
    <section className="mission-planner" aria-labelledby={headingId}>
      <h3 id={headingId}>Mission planner</h3>
      <p>Jezero crater · {coverage.kind === "route-grade" ? "Route-grade coverage" : "Limited coverage"}</p>
      <small>{coverage.reason}</small>
      <small>Illustrative task availability at the current frame. Defer surface tasks inside the current dust footprint.</small>
      <ol className="mission-plan-order" aria-label="Visit order">
        <li><strong>Depart crew base</strong><small data-testid="route-base-coordinates">{coordinates}</small></li>
        <li><strong>{mission?.title ?? "Primary objective unavailable"}</strong><small>Primary objective</small><small data-testid="objective-assessment">{objectiveAssessment(mission ?? undefined)}</small></li>
        {plan.optionalObjectiveIds.map((id, index) => {
          const title = byId.get(id)?.title ?? "Unavailable objective";
          return (
            <li key={id}>
              <strong>{title}</strong>
              <small data-testid="objective-assessment">{objectiveAssessment(byId.get(id))}</small>
              <div className="mission-plan-order-actions">
                <button type="button" aria-label={"Move " + title + " earlier"} disabled={disabled || index === 0} onClick={() => reorder(index, -1)}>↑</button>
                <button type="button" aria-label={"Move " + title + " later"} disabled={disabled || index === plan.optionalObjectiveIds.length - 1} onClick={() => reorder(index, 1)}>↓</button>
                <button type="button" aria-label={"Remove " + title} disabled={disabled} onClick={() => update({ optionalObjectiveIds: plan.optionalObjectiveIds.filter((item) => item !== id) })}>Remove</button>
              </div>
            </li>
          );
        })}
        <li><strong>Return to crew base</strong><small data-testid="route-base-coordinates">{coordinates}</small></li>
      </ol>
      {optionalObjectives.some(({ id }) => !plan.optionalObjectiveIds.includes(id)) && (
        <details className="mission-plan-add">
          <summary>Optional map objectives</summary>
          <ul>{optionalObjectives.filter(({ id }) => !plan.optionalObjectiveIds.includes(id)).map((objective) => (
            <li key={objective.id}>
              <button type="button" disabled={disabled} onClick={() => update({ optionalObjectiveIds: [...plan.optionalObjectiveIds, objective.id] })}>Add {objective.title}</button>
              <small>{objectiveAssessment(objective)}</small>
            </li>
          ))}</ul>
        </details>
      )}
      <div className="mission-plan-routes" role="group" aria-label="Round-trip route options">
        <strong>Round-trip route options</strong>
        {routePreferences.map((id) => {
          const route = routes.find((candidate) => candidate.id === id);
          const budget = budgets[id];
          const oxygen = budget?.perMember[0]?.oxygenUseRange;
          const battery = budget?.perMember[0]?.batteryUseRange;
          return (
            <button key={id} type="button" className="mission-plan-option" aria-pressed={plan.routePreference === id}
              disabled={disabled || !route} onClick={() => update({ routePreference: id })}>
              <strong>{routeLabels[id]}{budget && " · " + Math.round(budget.distanceM) + " m round trip"}</strong>
              {budget ? <small>{budget.totalTimeMin.toFixed(1)} min total
                {oxygen && battery && <> · O₂ {percentRange(oxygen.minPct, oxygen.maxPct)} · Battery {percentRange(battery.minPct, battery.maxPct)}</>}
              </small> : <small>{routeHazardStatus || route ? "Route budget unavailable" : "No route through mapped terrain"}</small>}
            </button>
          );
        })}
        {routeHazardStatus ? <p role="status">{routeHazardStatus}</p>
          : !routes.some(({ id }) => id === plan.routePreference) && <p role="status">Mapped terrain cannot support the selected round trip. Review the objectives or choose an available route.</p>}
        <small>Terrain-weighted route candidates. Resource use is shown in percentage points per astronaut.</small>
      </div>
      {selectedBudget && (
        <section className="selected-route-budget" aria-label="Selected route budget">
          <div><strong>Selected route budget</strong><small>{selectedBudget.label}</small></div>
          <dl className="mission-budget-time">
            <div><dt>Travel</dt><dd>{selectedBudget.travelTimeMin.toFixed(1)} min</dd></div>
            <div><dt>Objective work</dt><dd>{selectedBudget.taskTimeMin.toFixed(1)} min</dd></div>
            <div><dt>Preparation</dt><dd>{selectedBudget.preparationMin} min</dd></div>
            <div><dt>Contingency</dt><dd>{selectedBudget.contingencyMin} min</dd></div>
            <div><dt>Storm delay in travel</dt><dd data-testid="storm-delay">{selectedBudget.stormDelayMin.toFixed(2)} min</dd></div>
            <div><dt>Total</dt><dd>{selectedBudget.totalTimeMin.toFixed(1)} min</dd></div>
          </dl>
          <small>Return reserve · {selectedBudget.returnOxygenReserve}% O₂ · {selectedBudget.returnBatteryReserve}% battery</small>
          {selectedBudget.perMember.map((member) => {
            const { oxygenRemainingRange: oxygen, batteryRemainingRange: battery } = member;
            const low = oxygen.minPct < selectedBudget.returnOxygenReserve || battery.minPct < selectedBudget.returnBatteryReserve;
            const name = room.members.find(({ id }) => id === member.id)?.name ?? member.id;
            return (
              <div key={member.id} className="mission-budget-member" role="group" aria-label={name}>
                <strong>{name}</strong>
                <small>Start · O₂ {member.oxygenStart.toFixed(1)}% · Battery {member.batteryStart.toFixed(1)}%</small>
                <small>Expected use · O₂ {member.oxygenUseRange.expectedPct.toFixed(1)}% · Battery {member.batteryUseRange.expectedPct.toFixed(1)}%</small>
                <small>At return · O₂ {percentRange(oxygen.minPct, oxygen.maxPct)} · Battery {percentRange(battery.minPct, battery.maxPct)}</small>
                {low && <small className="mission-plan-conflict">Return balance can fall below reserve.</small>}
                {member.missingEquipment.length > 0 && <small className="mission-plan-conflict">Equipment needed · {member.missingEquipment.join(", ")}</small>}
              </div>
            );
          })}
          <details className="simulation-provenance">
            <summary>Budget assumptions</summary>
            <dl className="mission-budget-assumptions">
              <dt>Base walking speed</dt><dd>{assumptions.walkingSpeedMps} m/s</dd>
              <dt>Slope time adjustment</dt><dd>Walking time × (1 + {assumptions.slopeMultiplier} × slope / 90°)</dd>
              <dt>O₂ draw</dt><dd>{assumptions.oxygenUsePerMinPct} percentage points per EVA minute</dd>
              <dt>Battery draw</dt><dd>{assumptions.batteryUsePerMinPct} percentage points per EVA minute</dd>
              <dt>Storm walking time</dt><dd>{assumptions.stormTravelMultiplier}× during exposure</dd>
              <dt>Storm battery draw</dt><dd>{assumptions.stormMultiplierRange.join("–")}× during exposure</dd>
            </dl>
          </details>
        </section>
      )}
    </section>
  );
}

function percentRange(minimum: number, maximum: number) {
  return minimum === maximum ? minimum.toFixed(1) + "%" : minimum.toFixed(1) + "–" + maximum.toFixed(1) + "%";
}
