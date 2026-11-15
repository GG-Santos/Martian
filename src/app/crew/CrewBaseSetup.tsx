"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Star, TriangleAlert } from "lucide-react";
import { CrewHazardIcon } from "./CrewHazardIcon";
import type { LocalPoint } from "../../features/mission/types";
import type { Quest } from "../../features/quests/quest-types";
import { assessCrewSlope, createCrewBaseScenario, crewBaseHazardsAt, type CrewSlopeGrid } from "../../features/crew/crew-hazard-scenario";
import { ZONE_SLOPE_BANDS_DEG } from "../../features/zones/classify-zones";
import { boardLocation, QuestSectorMap } from "../board/QuestSectorMap";
import { CrewStepActions } from "./CrewStepActions";

export function CrewBaseSetup({ mission, base, capacity, minimumCapacity = 1, hazardSeed, onBaseChange, onCapacityChange, onBack, onContinue, timeline, backLabel = "Back to mission", continueLabel = "Continue to character" }: {
  mission: Quest;
  base: LocalPoint | null;
  capacity: number;
  minimumCapacity?: number;
  hazardSeed: string;
  onBaseChange: (point: LocalPoint | null) => void;
  onCapacityChange: (capacity: number) => void;
  onBack: () => void;
  onContinue: () => void;
  timeline: ReactNode;
  backLabel?: string;
  continueLabel?: string;
}) {
  const location = boardLocation(mission.datasetId);
  const [slopeData, setSlopeData] = useState<{ regionId: string; status: "loading" | "ready" | "unavailable"; grid?: CrewSlopeGrid }>({ regionId: location.regionId, status: location.regionId === "jezero" ? "loading" : "unavailable" });
  useEffect(() => {
    if (location.regionId !== "jezero") {
      setSlopeData({ regionId: location.regionId, status: "unavailable" });
      return;
    }
    let active = true;
    setSlopeData({ regionId: location.regionId, status: "loading" });
    fetch("/data/jezero/slope.u8").then(response => response.ok ? response.arrayBuffer() : Promise.reject(new Error("Slope layer unavailable")))
      .then(bytes => {
        if (!active) return;
        if (bytes.byteLength !== 257 * 257) { setSlopeData({ regionId: location.regionId, status: "unavailable" }); return; }
        setSlopeData({ regionId: location.regionId, status: "ready", grid: { width: 257, height: 257, cellSizeM: 8, westM: 0, northM: 2048, values: new Uint8Array(bytes) } });
      })
      .catch(() => { if (active) setSlopeData({ regionId: location.regionId, status: "unavailable" }); });
    return () => { active = false; };
  }, [location.regionId]);
  const currentSlopeData = slopeData.regionId === location.regionId ? slopeData : { regionId: location.regionId, status: location.regionId === "jezero" ? "loading" as const : "unavailable" as const };
  const activeSlopeGrid = currentSlopeData.status === "ready" ? currentSlopeData.grid : undefined;
  const slopeLoading = currentSlopeData.status === "loading";
  const scenario = useMemo(() => createCrewBaseScenario(hazardSeed, location.regionId, activeSlopeGrid, mission.point), [hazardSeed, location.regionId, activeSlopeGrid, mission.point]);
  const overlaps = crewBaseHazardsAt(base, scenario);
  const baseSlope = base ? assessCrewSlope(base, activeSlopeGrid) : null;
  const terrainHazard = baseSlope?.severity === "hazard";
  const steepSlopeThreshold = ZONE_SLOPE_BANDS_DEG.cautionMax;
  const safeBase = overlaps.length === 0 && !terrainHazard && !slopeLoading ? base : null;
  const [placementError, setPlacementError] = useState("");
  useEffect(() => {
    if (!base || slopeLoading) return;
    if (overlaps.length > 0) {
      onBaseChange(scenario.recommendedAreas[0]?.point ?? null);
      setPlacementError("A saved base point was inside a simulated hazard and has been cleared. Choose outside the shaded hazard areas.");
    } else if (terrainHazard) {
      onBaseChange(scenario.recommendedAreas[0]?.point ?? null);
      setPlacementError(`A saved base point was on mapped slope above ${steepSlopeThreshold}° and has been cleared. Choose a point outside the mapped steep terrain.`);
    }
  }, [base, onBaseChange, overlaps.length, scenario, slopeLoading, terrainHazard]);
  const chooseBase = (point: LocalPoint) => {
    if (crewBaseHazardsAt(point, scenario).length > 0) {
      setPlacementError("That point is inside a simulated hazard area. Choose a point outside the shaded cells.");
      return;
    }
    if (assessCrewSlope(point, activeSlopeGrid).severity === "hazard") {
      setPlacementError(`That point is on mapped slope above ${steepSlopeThreshold}°. Choose a flatter mapped point.`);
      return;
    }
    setPlacementError("");
    onBaseChange(point);
  };
  const nearbyHazards = safeBase ? scenario.zones.filter(zone => {
    const dx = (safeBase.x - zone.center.x) / (zone.radiusX + 64);
    const dy = (safeBase.y - zone.center.y) / (zone.radiusY + 64);
    return dx * dx + dy * dy <= 1 && !overlaps.some(overlap => overlap.id === zone.id);
  }) : [];
  const missionDistance = safeBase && mission.point
    ? Math.hypot(safeBase.x - mission.point.x, safeBase.y - mission.point.y)
    : null;
  const missionProximityWarning = missionDistance !== null && missionDistance < 128
    ? missionDistance < 1
      ? "The base is directly on the mission point. Choose a point at least 128 m away when possible."
      : `The base is only ${Math.round(missionDistance)} m from the mission point. Choose a point at least 128 m away when possible.`
    : null;
  return <section className="crew-base-step" aria-labelledby="crew-base-heading">
    <aside className="crew-base-aside">
      <div className="crew-base-aside-content">
      <section className="crew-base-mission crew-base-intro" aria-labelledby="crew-base-heading">
        <span className="eyebrow">CREW ASSEMBLY</span>
        <h1 id="crew-base-heading">{mission.title}</h1>
        <p>{mission.description}</p>
      </section>
      <fieldset className="crew-base-capacity">
        <legend>Room capacity</legend>
        <p>Choose how many astronauts can join, including you.</p>
        <div className="crew-base-capacity-options" role="radiogroup" aria-label="Room capacity">
          {[1, 2, 3, 4, 5].map(value => <label className="crew-base-capacity-option" key={value} data-selected={capacity === value ? "true" : undefined} data-disabled={value < minimumCapacity ? "true" : undefined}>
            <input type="radio" name="crew-capacity" value={value} checked={capacity === value} disabled={value < minimumCapacity} onChange={() => onCapacityChange(value)} />
            <span className="crew-base-capacity-number">{value}</span><span className="crew-base-capacity-unit">{value === 1 ? "astronaut" : "astronauts"}</span>
            {value === mission.recommendedCrewSize && <span className="crew-base-capacity-recommended" role="img" aria-label="Mission recommended"><Star size={13} fill="currentColor" aria-hidden="true" /></span>}
          </label>)}
        </div>
      </fieldset>
      <div className="crew-base-planning">
        <section className="crew-base-map-meta" aria-label="Map placement guidance">
          <div className="crew-base-panel-title"><span>PLACEMENT</span><strong>Choose a base point</strong></div>
          <p id="quest-pin-guidance">{slopeLoading ? "Loading the mapped Jezero slope layer…" : scenario.recommendedAreas.length ? `Choose a suggested area or an unshaded point. Simulated hazards and mapped slopes above ${steepSlopeThreshold}° are blocked. Unknown slope is not a safety assessment.` : "No suitable suggested area was found near this mission point. Choose an unshaded point outside hazard areas."}</p>
          <div className="crew-base-hazard-legend" aria-label="Map legend">
            <span><i className="crew-base-legend-symbol crew-base-legend-symbol--mission" />Mission point</span><span><i className="crew-base-legend-symbol crew-base-legend-symbol--base" />Base</span><span><i className="crew-base-legend-symbol crew-base-legend-symbol--recommended" />Suggested area</span><span><i className="crew-base-legend-slope" />Mapped slope</span><span><i className="crew-base-legend-intensity" />Hazard intensity</span>
          </div>
          {missionProximityWarning && <p className="crew-base-overlap-warning crew-base-mission-warning" role="status"><TriangleAlert size={15} aria-hidden="true" /><span>{missionProximityWarning}</span></p>}
          {placementError && <p className="crew-base-overlap-warning" role="status"><TriangleAlert size={15} aria-hidden="true" /><span>{placementError}</span></p>}
          {nearbyHazards.length > 0 && <p className="crew-base-overlap-warning" role="status"><TriangleAlert size={15} aria-hidden="true" /><span>Base is within about 64 m of a simulated {nearbyHazards.map(zone => zone.label).join(", ")} zone. Placement is allowed.</span></p>}
        </section>
        <section className="crew-base-scenario-summary" aria-label="Simulated crew hazard scenario">
        <div className="crew-base-scenario-head crew-base-scenario-head--hazards"><TriangleAlert size={14} aria-hidden="true" /><span className="eyebrow">SIMULATED HAZARDS</span></div>
        <p>Fixed for this crew and region; missions in this region share the same scenario.</p>
        {scenario.zones.length > 0 ? <div className="crew-base-hazard-list" aria-label="Simulated hazard areas">{scenario.zones.map(zone => <span className={`crew-base-hazard-chip crew-base-hazard-chip--${zone.kind}`} key={zone.id}><CrewHazardIcon kind={zone.kind} size={12} /><span>{zone.label}</span></span>)}</div> : <p className="crew-base-hazard-empty">No simulated hazard areas in this scenario.</p>}
        <div className="crew-base-terrain-summary" aria-label="Mapped terrain slope">
          <div className="crew-base-scenario-head"><CrewHazardIcon kind="slope" size={14} /><span className="eyebrow">MAPPED TERRAIN</span></div>
          {activeSlopeGrid ? <><p>Archived HiRISE slope data; steep cells are blocked.</p><div className="crew-base-hazard-list"><span className="crew-base-hazard-chip crew-base-hazard-chip--slope"><CrewHazardIcon kind="slope" size={12} /><span>Slope</span></span></div></> : <p>{slopeLoading ? "Loading the archived HiRISE slope grid…" : "No registered terrain slope grid for this sector. Slope is unknown; suggested areas are illustrative."}</p>}
        </div>
        </section>
      </div>
      </div>
      {timeline}
    </aside>
    <div className="crew-base-controls">
      <div className="crew-base-map" role="region" aria-label={`Interactive ${location.name} sector map`}>
        <QuestSectorMap missionId={mission.datasetId} point={safeBase} onPointChange={slopeLoading ? undefined : chooseBase} pinLabel="crew base" focusPoint={mission.point} mapClassName="crew-base-sector-map" baseScenario={scenario} recommendedAreas={!slopeLoading} slopeGrid={activeSlopeGrid} showSlopeOverlay={Boolean(activeSlopeGrid)} />
      </div>
      <CrewStepActions className="crew-base-actions" backLabel={backLabel} continueLabel={continueLabel} onBack={onBack} onContinue={() => { if (safeBase) onContinue(); }} disabled={!safeBase || slopeLoading} />
    </div>
  </section>;
}
