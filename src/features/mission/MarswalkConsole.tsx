"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import {
  ArrowRight,
  ArrowLeft,
  Play,
  Pause,
  Camera,
  Flame,
  Mountain,
  Wind,
  ScanLine,
  Layers,
  Atom,
  FlaskConical,
  Route,
  Check,
  Flag,
  Home,
  TriangleAlert,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import { useRoom } from "../session/RoomProvider";
import type { MissionData, LocalPoint } from "./types";
import type { Hazard, HazardCategory } from "../hazards/hazard-types";
import { parseScenario } from "../hazards/hazard-geometry";
import { createCrewBaseScenario } from "../crew/crew-hazard-scenario";
import { loadOptionalAsset, loadScalarLayer } from "./load-mission";
import {
  buildCrewRouteOptions,
  type CrewRouteOption,
} from "../route/crew-route";
import type { HeightGrid } from "./types";
import type { PlannedObjective } from "./mission-plan";
import {
  loadScienceAtlas,
  type ScienceEvidenceRecord,
  type ScienceCategory,
} from "../science/science-atlas";
import { ScienceEvidence } from "../science/ScienceEvidence";
import { AtmosphericView } from "../science/AtmosphericView";
import { MarswalkMap, type SurfaceLayer } from "./MarswalkMap";
import {
  buildWalkTimeline,
  sampleWalk,
  type WalkTimeline,
} from "./marswalk-simulation";
import { MarswalkResults } from "./MarswalkResults";
import { ModelNotes } from "./MarswalkModelNotes";
import "./marswalk.css";

const MarswalkSimulationScene = dynamic(
  () => import("./MarswalkSimulationScene").then((module) => module.MarswalkSimulationScene),
  { ssr: false, loading: () => <p className="simulation-terrain-loading" role="status">Loading 3D terrain…</p> },
);

const atlasLayers = [
  {
    id: "optical",
    title: "Optical",
    note: "HiRISE · surface imagery",
    Icon: Camera,
  },
  {
    id: "thermal",
    title: "Thermal",
    note: "THEMIS · IR brightness",
    Icon: Flame,
  },
  {
    id: "topographic",
    title: "Topographic",
    note: "HiRISE stereo · elevation",
    Icon: Mountain,
  },
  {
    id: "slope",
    title: "Terrain slope",
    note: "Derived from elevation",
    Icon: Route,
  },
  {
    id: "atmospheric",
    title: "Atmospheric",
    note: "Rover weather archive",
    Icon: Wind,
  },
  {
    id: "spectral",
    title: "Spectral",
    note: "Regional mineral evidence",
    Icon: ScanLine,
  },
  {
    id: "geophysical",
    title: "Geophysical",
    note: "Regional subsurface evidence",
    Icon: Layers,
  },
  { id: "radiation", title: "Radiation", note: "Mars context", Icon: Atom },
  {
    id: "chemical",
    title: "Chemical",
    note: "Rover target evidence",
    Icon: FlaskConical,
  },
] as const;
const mapLayers = ["optical", "thermal", "topographic", "slope"];
type Stage = "plan" | "simulation" | "results";
type Run = {
  timeline: WalkTimeline;
  route: CrewRouteOption;
  minute: number;
  playing: boolean;
  aborted: boolean;
  signature: string;
};

function useWalkRoutes(
  key: string | null,
  grid: HeightGrid,
  hazards: Hazard[],
  ready: boolean,
) {
  return useMemo(() => {
    if (!key || !ready) return [];
    const [base, primary, optional] = JSON.parse(key) as [
      LocalPoint,
      PlannedObjective,
      PlannedObjective[],
    ];
    return buildCrewRouteOptions(grid, base, primary, optional, hazards);
  }, [key, grid, hazards, ready]);
}

function useWalkTimeline(
  route: CrewRouteOption | undefined,
  grid: HeightGrid,
  hazards: Hazard[],
  resourceKey: string,
  objectiveKey: string,
) {
  return useMemo(() => {
    if (!route) return null;
    const resources = JSON.parse(resourceKey) as {
      oxygen: number;
      battery: number;
    }[];
    return buildWalkTimeline(
      route,
      grid,
      JSON.parse(objectiveKey),
      hazards,
      Math.min(100, ...resources.map((r) => r?.oxygen ?? 100)),
      Math.min(100, ...resources.map((r) => r?.battery ?? 100)),
    );
  }, [route, resourceKey, objectiveKey, grid, hazards]);
}

export function MarswalkConsole({ mission }: { mission: MissionData }) {
  const { snapshot: room, connection, setExpeditionPlan } = useRoom();
  const [selectedStage, setStage] = useState<Stage>("plan");
  const [layer, setLayer] = useState<SurfaceLayer>("optical");
  const [simulationView, setSimulationView] = useState<"3d" | "2d">("3d");
  const atlasNavigation = useRef<HTMLElement>(null);
  useEffect(() => {
    const nav = atlasNavigation.current;
    if (!nav) return;
    const keepSelectionVisible = () => {
      const selected = nav.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!selected || nav.scrollWidth <= nav.clientWidth) return;
      const parent = nav.getBoundingClientRect(),
        child = selected.getBoundingClientRect();
      nav.scrollLeft +=
        child.left - parent.left - (parent.width - child.width) / 2;
    };
    keepSelectionVisible();
    const observer = new ResizeObserver(keepSelectionVisible);
    observer.observe(nav);
    return () => observer.disconnect();
  }, [layer, selectedStage]);
  const [atlas, setAtlas] = useState<
    Partial<Record<ScienceCategory, ScienceEvidenceRecord>>
  >({});
  const [thermal, setThermal] = useState<Uint8Array | null>(null);
  const [slope, setSlope] = useState<Uint8Array | null>(null);
  const [dataState, setDataState] = useState<"loading" | "ready" | "failed">(
    "loading",
  );
  const [fixedHazards, setFixedHazards] = useState<Hazard[]>([]);
  const [showHazards, setShowHazards] = useState(true);
  const [opacity, setOpacity] = useState(0.78);
  const [waypoints, setWaypoints] = useState<LocalPoint[]>([]);
  const [addingWaypoint, setAddingWaypoint] = useState(false);
  const [packed, setPacked] = useState<string[]>([]);
  const [run, setRun] = useState<Run | null>(null);
  const [speed, setSpeed] = useState(60);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.all([
      loadScienceAtlas("/data/jezero", mission.manifest),
      loadScalarLayer("/data/jezero", "thermal", mission.manifest),
      loadScalarLayer("/data/jezero", "slope", mission.manifest),
      loadOptionalAsset(
        "/data/jezero",
        "scenario.json",
        mission.manifest,
        fetch,
      ),
    ])
      .then(([records, scalar, slopeRaster, bytes]) => {
        if (!active) return;
        setAtlas(records);
        setThermal(scalar);
        setSlope(slopeRaster);
        if (!bytes) {
          setDataState("failed");
          return;
        }
        try {
          const raw = JSON.parse(new TextDecoder().decode(bytes));
          const hazards = parseScenario(raw, mission.manifest.bounds);
          if (
            !Array.isArray(raw) ||
            !hazards.length ||
            hazards.length !== raw.length
          )
            throw new Error();
          setFixedHazards(hazards.filter((h) => h.category !== "dust"));
          setDataState("ready");
        } catch {
          setDataState("failed");
        }
      })
      .catch(() => {
        if (active) setDataState("failed");
      });
    return () => {
      active = false;
    };
  }, [mission]);
  const scenarioKey =
    room && JSON.stringify([room.baseScenario, room.mission?.point, room.code]);
  const crewHazards = useMemo<Hazard[]>(() => {
    if (!scenarioKey) return [];
    const [config, point, code] = JSON.parse(scenarioKey);
    const scenario = createCrewBaseScenario(
      config?.seed ?? `legacy-${code}`,
      config?.locationId ?? "jezero",
      undefined,
      point,
    );
    const categories: Record<string, HazardCategory> = {
      heat: "depression",
      dust: "dust",
      chemical: "sand",
      radiation: "rockfall",
      rockfall: "rockfall",
      storm: "dust",
    };
    return scenario.zones.map((zone) => ({
      id: zone.id,
      category: categories[zone.kind],
      scenarioKind: zone.kind,
      title: zone.label,
      marker: zone.center,
      severity: "warning",
      evidence: "Scenario event",
      geometry: {
        kind: "polygon",
        points: Array.from({ length: 24 }, (_, i) => ({
          x: zone.center.x + Math.cos((i / 24) * Math.PI * 2) * zone.radiusX,
          y: zone.center.y + Math.sin((i / 24) * Math.PI * 2) * zone.radiusY,
        })),
      },
      description: "Crew simulation",
      risks: [],
      precautions: [],
      sources: ["Seeded crew scenario"],
    }));
  }, [scenarioKey]);
  const hazards = useMemo(
    () => [...fixedHazards, ...crewHazards],
    [fixedHazards, crewHazards],
  );
  const plan = room?.expeditionPlan;
  const optional =
    room?.quests.filter(
      (q) =>
        q.id !== room.mission?.id &&
        ["published", "accepted"].includes(q.status),
    ) ?? [];
  const selected = optional
    .filter((q) => plan?.optionalObjectiveIds.includes(q.id))
    .sort(
      (a, b) =>
        (plan?.optionalObjectiveIds.indexOf(a.id) ?? 0) -
        (plan?.optionalObjectiveIds.indexOf(b.id) ?? 0),
    );
  const objectives = [room?.mission, ...selected].filter((q) => !!q);
  const required = [...new Set(objectives.flatMap((q) => q!.equipment))];
  const routeKey =
    room?.base && room.mission && plan
      ? JSON.stringify([
          room.base,
          { id: room.mission.id, point: room.mission.point },
          [
            ...selected.map((q) => ({ id: q.id, point: q.point })),
            ...waypoints.map((point, i) => ({ id: `detour-${i}`, point })),
          ],
        ])
      : null;
  const routes = useWalkRoutes(
    routeKey,
    mission.grid,
    hazards,
    dataState === "ready",
  );
  const route = routes.find((r) => r.id === plan?.routePreference);
  const signature = JSON.stringify([routeKey, plan?.routePreference]);
  const resourceKey = JSON.stringify(
    room?.members.map((m) => room.resources[m.id]) ?? [],
  );
  const objectiveKey = JSON.stringify(
    objectives.map((q) => ({
      id: q!.id,
      title: q!.title,
      durationMin: q!.durationMin,
    })),
  );
  const timeline = useWalkTimeline(
    route,
    mission.grid,
    hazards,
    resourceKey,
    objectiveKey,
  );
  const preview = timeline && sampleWalk(timeline, timeline.durationMin);
  const sample = run && sampleWalk(run.timeline, run.minute);
  const stage =
    run && selectedStage === "simulation" && (sample?.finished || run.aborted)
      ? "results"
      : selectedStage;
  useEffect(() => {
    if (!run?.playing) return;
    const timer = window.setInterval(
      () =>
        setRun((current) => {
          if (!current?.playing) return current;
          const next = Math.min(
            current.timeline.durationMin,
            current.minute + speed / 240,
          );
          const state = sampleWalk(current.timeline, next);
          return { ...current, minute: next, playing: !state.finished };
        }),
      250,
    );
    return () => window.clearInterval(timer);
  }, [run?.playing, speed]);
  if (!room || !plan || !room.mission)
    return <p role="status">Restoring the expedition…</p>;
  const disabled = connection !== "online";
  const archive = !mapLayers.includes(layer);
  const currentLayer = atlasLayers.find((item) => item.id === layer)!;
  const updatePlan = (change: Partial<typeof plan>) => {
    if (!disabled)
      setExpeditionPlan(room.code, room.revision, { ...plan, ...change });
  };
  const canStart =
    !!timeline && required.every((item) => packed.includes(item)) && !disabled;
  const start = () => {
    if (!timeline || !route || !canStart) return;
    setRun({
      timeline,
      route,
      minute: 0,
      playing: true,
      aborted: false,
      signature,
    });
    setLayer("optical");
    setSimulationView("3d");
    setStage("simulation");
    setAddingWaypoint(false);
  };
  const reset = () => {
    setRun(null);
    setStage("plan");
    setNotice("");
  };
  const navigate = (next: Stage) => {
    if (next === "plan" && run?.playing) setRun({ ...run, playing: false });
    setStage(next);
  };
  const failed = !!run?.aborted || !sample?.success;
  const localLayer = layer === "optical" || layer === "slope" || layer === "thermal" || layer === "topographic" ? layer : null;
  const showSimulationTerrain = stage === "simulation" && simulationView === "3d" && localLayer && run;
  const surfaceMap = <MarswalkMap
    mission={mission}
    room={room}
    route={stage === "simulation" && run ? run.route : route}
    hazards={hazards}
    showHazards={showHazards}
    opacity={opacity}
    layer={layer}
    thermal={thermal}
    slope={slope}
    crewPoint={stage === "simulation" && sample ? sample.point : (room.base ?? undefined)}
    onPick={stage === "plan" && addingWaypoint ? point => {
      setWaypoints(list => [...list, point]);
      setAddingWaypoint(false);
      setNotice("Return detour added. The round trip and resource forecast have been recalculated.");
    } : undefined}
  />;
  const layerRange =
    layer === "thermal"
      ? `${mission.manifest.thermalDnRange.join("–")} DN · relative IR brightness, not °C`
      : layer === "slope"
        ? "0° · 10° · 15° · 30°+ · derived slope"
        : `${mission.manifest.elevationRangeM.map(Math.round).join(" to ")} m · elevation`;
  return (
    <div className={`marswalk-console stage-${stage}`}>
      <header className="walk-header">
        <div>
          <h1>
            {stage === "plan"
              ? "Every step starts here."
              : stage === "simulation"
                ? "Make the science. Make it home."
                : failed
                  ? "A route worth rethinking."
                  : "Science brought home."}
          </h1>
          <p>
            {room.crewName} · Jezero crater · {room.members.length}{" "}
            {room.members.length === 1 ? "explorer" : "explorers"}
          </p>
        </div>
        <nav aria-label="Expedition stages">
          {(["plan", "simulation", "results"] as Stage[]).map((item, i) => (
            <button
              key={item}
              aria-current={stage === item ? "step" : undefined}
              disabled={
                item !== "plan" &&
                (!run ||
                  (item === "results" && !sample?.finished && !run.aborted))
              }
              onClick={() => navigate(item)}
            >
              <span>{String(i + 1).padStart(2, "0")}</span>
              {item === "plan"
                ? "Plan"
                : item === "simulation"
                  ? "Simulate"
                  : "Results"}
            </button>
          ))}
        </nav>
      </header>
      {notice && (
        <p className="walk-notice" role="status">
          {notice}
        </p>
      )}
      {stage === "results" && sample && run ? (
        <MarswalkResults room={room} run={run} sample={sample} reset={reset} />
      ) : (
        <div className="walk-workspace">
          <aside
            className="walk-brief"
            aria-label={
              stage === "plan" ? "Mission planning" : "Expedition telemetry"
            }
          >
            {stage === "plan" ? (
              <>
                <h2>{room.mission.title}</h2>
                <p>{room.mission.description}</p>
                <details className="walk-science-brief">
                  <summary>Science brief</summary>
                  <h3>What we’re investigating</h3>
                  <p>{room.mission.hypothesis}</p>
                  <h3>Record in the field</h3>
                  <p>{room.mission.expectedObservations}</p>
                  <h3>Completion criteria</h3>
                  <p>{room.mission.completionCriteria}</p>
                </details>
                <h3>Your traverse</h3>
                <ol className="walk-itinerary">
                  <li>
                    <Home size={16} />
                    <span>
                      Leave the habitat
                      <small>
                        {Math.round(room.base?.x ?? 0)} E ·{" "}
                        {Math.round(room.base?.y ?? 0)} N m
                      </small>
                    </span>
                  </li>
                  {objectives.map((q, i) => (
                    <li key={q!.id}>
                      <Flag size={16} />
                      <span>
                        {q!.title}
                        <small>
                          {q!.durationMin} min fieldwork
                          {i === 0
                            ? " · primary objective"
                            : " · optional science"}
                        </small>
                      </span>
                      {i > 0 && (
                        <button
                          aria-label={`Remove ${q!.title}`}
                          disabled={disabled}
                          onClick={() =>
                            updatePlan({
                              optionalObjectiveIds:
                                plan.optionalObjectiveIds.filter(
                                  (id) => id !== q!.id,
                                ),
                            })
                          }
                        >
                          Remove
                        </button>
                      )}
                    </li>
                  ))}
                  {waypoints.map((p, i) => (
                    <li key={i}>
                      <Route size={16} />
                      <span>
                        Return detour {i + 1}
                        <small>
                          {p.x} E · {p.y} N m
                        </small>
                      </span>
                      <button
                        onClick={() =>
                          setWaypoints((points) =>
                            points.filter((_, index) => index !== i),
                          )
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                  <li>
                    <Home size={16} />
                    <span>
                      Return to habitat
                      <small>Keep 20% oxygen and battery in reserve</small>
                    </span>
                  </li>
                </ol>
                <details>
                  <summary>Add science stops</summary>
                  {optional
                    .filter((q) => !plan.optionalObjectiveIds.includes(q.id))
                    .map((q) => (
                      <button
                        className="walk-add-stop"
                        key={q.id}
                        disabled={disabled}
                        onClick={() =>
                          updatePlan({
                            optionalObjectiveIds: [
                              ...plan.optionalObjectiveIds,
                              q.id,
                            ],
                          })
                        }
                      >
                        {q.title}
                        <small>+ {q.durationMin} min fieldwork</small>
                      </button>
                    ))}
                  {optional.every((q) =>
                    plan.optionalObjectiveIds.includes(q.id),
                  ) && <p>All available science stops are on your route.</p>}
                </details>
                <Button
                  variant="outline"
                  className="walk-detour"
                  disabled={archive}
                  aria-pressed={addingWaypoint}
                  onClick={() => setAddingWaypoint(!addingWaypoint)}
                >
                  {addingWaypoint
                    ? "Cancel map waypoint"
                    : "Add a return detour"}
                  <Route size={15} />
                </Button>
                <fieldset className="walk-routes">
                  <legend>Choose a route</legend>
                  {(["efficient", "lower-exposure"] as const).map((id) => {
                    const option = routes.find((r) => r.id === id);
                    return (
                      <button
                        key={id}
                        disabled={disabled || !option}
                        aria-pressed={plan.routePreference === id}
                        onClick={() => updatePlan({ routePreference: id })}
                      >
                        <span>
                          {id === "efficient" ? "Efficient" : "Lower exposure"}
                        </span>
                        <small>
                          {option
                            ? `${Math.round(option.summary.distanceM)} m round trip`
                            : dataState === "loading"
                              ? "Checking terrain…"
                              : "No supported route"}
                        </small>
                      </button>
                    );
                  })}
                </fieldset>
                {dataState === "failed" && (
                  <p role="alert">
                    Hazard data could not be verified. Reload the page to retry
                    before simulation.
                  </p>
                )}
                <details>
                  <summary>
                    Pack the field kit ·{" "}
                    {required.filter((item) => packed.includes(item)).length}/
                    {required.length}
                  </summary>
                  <p>Confirm the equipment carried for this rehearsal.</p>
                  {required.map((item) => (
                    <label className="walk-kit" key={item}>
                      <input
                        type="checkbox"
                        checked={packed.includes(item)}
                        onChange={() =>
                          setPacked((list) =>
                            list.includes(item)
                              ? list.filter((v) => v !== item)
                              : [...list, item],
                          )
                        }
                      />
                      {item}
                    </label>
                  ))}
                </details>
                {preview && (
                  <div
                    className={`walk-forecast ${!preview.success ? "is-warning" : ""}`}
                  >
                    <strong>
                      {timeline!.durationMin.toFixed(0)} min outside the habitat
                    </strong>
                    <p>
                      At return · O₂ {preview.oxygen.toFixed(0)}% · Battery{" "}
                      {preview.battery.toFixed(0)}%
                    </p>
                    <small>
                      {preview.success
                        ? "Predicted return above the 20% reserve."
                        : "This plan can breach reserve or exhaust resources. Revise it or rehearse the failure."}
                    </small>
                  </div>
                )}
                <Button
                  className="walk-primary"
                  disabled={!canStart}
                  onClick={start}
                >
                  Begin simulation <ArrowRight size={17} />
                </Button>
                {!required.every((item) => packed.includes(item)) && (
                  <small>Confirm the field kit to begin.</small>
                )}
                <details className="walk-model">
                  <summary>Sources and simulation model</summary>
                  <ModelNotes />
                </details>
              </>
            ) : sample && run ? (
              <>
                <h2>
                  {sample.action?.kind === "science"
                    ? "Boots down. Science begins."
                    : "Keep the habitat within reach."}
                </h2>
                <p className="walk-action" aria-live="polite">
                  {sample.action?.label}
                </p>
                <div className="walk-clock">
                  <strong>{sample.elapsedMin.toFixed(1)}</strong>
                  <span> / {run.timeline.durationMin.toFixed(0)} min EVA</span>
                </div>
                <progress
                  aria-label="Expedition progress"
                  max={run.timeline.durationMin}
                  value={sample.elapsedMin}
                />
                <div
                  className={`walk-urgency ${sample.oxygen < 30 || sample.battery < 30 ? "is-warning" : ""}`}
                  role="status"
                >
                  {sample.oxygen < 20 || sample.battery < 20
                    ? "Return reserve breached. The crew’s margin is gone."
                    : sample.oxygen < 30 || sample.battery < 30
                      ? "Reserve approaching. Every minute outside matters."
                      : sample.action?.kind === "science"
                        ? "Instruments are drawing power while the crew works."
                        : "Travel, terrain and fieldwork all draw from the return budget."}
                </div>
                <Resource label="Oxygen" value={sample.oxygen} />
                <Resource label="Suit battery" value={sample.battery} />
                <p>
                  {Math.round(sample.distanceM)} m walked ·{" "}
                  {sample.completed.length}/{run.timeline.objectiveCount}{" "}
                  science stops complete
                </p>
                <h3>Crew on the traverse</h3>
                <ul className="walk-crew">
                  {room.members.map((m) => (
                    <li key={m.id}>
                      <span>
                        {m.name}
                        <small>
                          {m.role}
                          {m.isBot ? " · bot" : ""}
                        </small>
                      </span>
                      <Check size={15} />
                    </li>
                  ))}
                </ul>
                {sample.action?.hazards.length ? (
                  <p className="walk-warning">
                    <TriangleAlert size={16} /> Crossing{" "}
                    {sample.action.hazards.join(", ")}. Hazard footprints are
                    scenario inputs.
                  </p>
                ) : null}
                <div className="walk-playback">
                  <Button
                    onClick={() => setRun({ ...run, playing: !run.playing })}
                  >
                    {run.playing ? <Pause size={16} /> : <Play size={16} />}
                    {run.playing ? "Pause" : "Resume"}
                  </Button>
                  <label>
                    Speed
                    <select
                      value={speed}
                      onChange={(e) => setSpeed(Number(e.target.value))}
                    >
                      <option value={30}>30×</option>
                      <option value={60}>60×</option>
                      <option value={240}>240×</option>
                    </select>
                  </label>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    setRun({ ...run, playing: false, aborted: true })
                  }
                >
                  End rehearsal
                </Button>
                <small>
                  Local rehearsal · does not spend shared room resources.
                </small>
              </>
            ) : null}
          </aside>
          <section className="walk-map-column" aria-label="Mars surface atlas">
            <div className="walk-atlas">
              <nav ref={atlasNavigation} aria-label="Science atlas">
                {atlasLayers.map(({ id, title, Icon }) => (
                  <button
                    key={id}
                    aria-pressed={layer === id}
                    disabled={
                      (id === "thermal" && !thermal) ||
                      (id === "slope" && !slope)
                    }
                    onClick={() => {
                      setLayer(id);
                      setAddingWaypoint(false);
                    }}
                    title={atlasLayers.find((l) => l.id === id)!.note}
                  >
                    <Icon size={15} />
                    <span>{title}</span>
                  </button>
                ))}
              </nav>
              <div className="walk-layer-context">
                <span>{currentLayer.note}</span>
                {stage === "simulation" && !archive && <div className="simulation-view-switch" role="group" aria-label="Simulation map view">
                  <button aria-pressed={simulationView === "3d"} onClick={() => setSimulationView("3d")}>3D terrain</button>
                  <button aria-pressed={simulationView === "2d"} onClick={() => setSimulationView("2d")}>2D map</button>
                </div>}
                {!archive && layer !== "optical" && (
                  <label>
                    Blend{" "}
                    <input
                      aria-label="Layer opacity"
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={opacity}
                      onChange={(e) => setOpacity(Number(e.target.value))}
                    />
                  </label>
                )}
                {!archive && (
                  <label>
                    <input
                      type="checkbox"
                      checked={showHazards}
                      onChange={(e) => setShowHazards(e.target.checked)}
                    />
                    Scenario hazards
                  </label>
                )}
              </div>
            </div>
            {archive ? (
              <div className="walk-archive">
                <div className="science-reference-back">
                  <Button variant="outline" onClick={() => setLayer("optical")}>
                    <ArrowLeft size={15} /> Back to the surface
                  </Button>
                  <span>Reference view · original source scale</span>
                </div>
                {layer === "atmospheric" ? (
                  <AtmosphericView manifest={mission.manifest} />
                ) : atlas[layer as ScienceCategory] ? (
                  <ScienceEvidence
                    key={layer}
                    record={atlas[layer as ScienceCategory]!}
                    manifest={mission.manifest}
                  />
                ) : (
                  <p role="status">
                    This reference product is unavailable in the packaged
                    archive. Choose a surface layer to continue planning.
                  </p>
                )}
              </div>
            ) : (
              <>
                {showSimulationTerrain ? <MarswalkSimulationScene
                  mission={mission} route={run.route} timeline={run.timeline} minute={run.minute}
                  playing={run.playing} members={room.members} hazards={showHazards ? hazards : []}
                  layer={localLayer} opacity={opacity} slope={slope} thermal={thermal}
                  fallback={<div className="simulation-terrain-fallback">
                    <p role="status">3D terrain unavailable. The simulation is continuing on the 2D map.</p>
                    {surfaceMap}
                  </div>}
                /> : surfaceMap}
                {addingWaypoint && (
                  <p className="walk-map-prompt" role="status">
                    Click the surface to add a waypoint to the return leg.
                  </p>
                )}
                {layer !== "optical" && (
                  <div className={`walk-raster-key key-${layer}`}>
                    <span />
                    {layerRange}
                    {layer === "slope" && (
                      <small>
                        8 m analysis grid · no-data transparent · illustrative
                        10° / 15° bands
                      </small>
                    )}
                  </div>
                )}
              </>
            )}
            <footer className="walk-surface-footer">
              <span>
                {stage === "simulation"
                  ? "Crew follows the planned traverse"
                  : "Plan a round trip. Protect the return."}
              </span>
              <small>
                {archive
                  ? "Reference evidence · separate coverage"
                  : showSimulationTerrain
                    ? "2.048 km local sector"
                    : "2.048 km local sector · drag to pan · use + / − to zoom"}
              </small>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

function Resource({ label, value }: { label: string; value: number }) {
  return (
    <div className={`walk-resource ${value < 30 ? "is-warning" : ""}`}>
      <label>
        {label}
        <strong>{value.toFixed(1)}%</strong>
      </label>
      <meter
        aria-label={label}
        min={0}
        max={100}
        low={20}
        optimum={100}
        value={value}
      />
    </div>
  );
}
