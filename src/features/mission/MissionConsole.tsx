"use client";
import dynamic from "next/dynamic";
import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import {
  loadMission,
  loadDisplayGrid,
  loadScalarLayer,
  loadDetailTile,
  loadOptionalAsset,
} from "./load-mission";
import type {
  MissionData,
  HeightGrid,
  DetailTile,
  RouteAction,
  LocalPoint,
  Assumptions,
  StopId,
} from "./types";
import {
  chooseDetailTile,
  stitchDetailEdge,
  LatestDetailRequest,
  type FocusCommand,
} from "../terrain/detail-surface";
import { inspectTerrain } from "../terrain/inspect-terrain";
import { TerrainReadout } from "../terrain/TerrainReadout";
import { TerrainToolbar } from "../terrain/TerrainToolbar";
import { getColorStops, getElevationRange } from "../terrain/terrain-style";
import type { TerrainDisplay } from "../terrain/terrain-display";
import type { ScalarLayers } from "../terrain/TerrainMesh";
import { TerrainFallback } from "../terrain/TerrainFallback";
import { LayerPanel } from "../layers/LayerPanel";
import {
  initialLayers,
  updateOptical,
  selectAnalysis,
} from "../layers/layer-state";
import {
  createRouteState,
  applyRouteAction,
  resolveNodes,
} from "../route/route-state";
import { calculateRoute } from "../route/calculate-route";
import { buildCrewRouteOptions } from "../route/crew-route";
import { RouteEditor, type EditMode } from "../route/RouteEditor";
import { ScienceAtlasPanel } from "../science/ScienceAtlasPanel";
import { ScienceEvidence } from "../science/ScienceEvidence";
import {
  loadScienceAtlas,
  type ScienceCategory,
  type ScienceEvidenceRecord,
} from "../science/science-atlas";
import { MapLegend } from "./MapLegend";
import { buildSlopeHazards } from "../hazards/build-slope-hazards";
import {
  parseScenario,
  routeHazardConflicts,
  pointInHazard,
} from "../hazards/hazard-geometry";
import { HazardPanel, hazardCategories } from "../hazards/HazardPanel";
import type { Hazard, HazardCategory } from "../hazards/hazard-types";
import { createCrewBaseScenario } from "../crew/crew-hazard-scenario";
import { buildTeamTimelines, type CrewId } from "../crew/crew-timeline";
import { useCrewPlayback } from "../crew/use-crew-playback";
import { PlaybackBar } from "../crew/PlaybackBar";
import { CrewPanel } from "../crew/CrewPanel";
import { QuestJournal } from "./QuestJournal";
import { ExpeditionEvidence } from "./ExpeditionEvidence";
import { SourceDrawer } from "./SourceDrawer";
import { ElevationProfile } from "../route/ElevationProfile";
import { makeRouteExport, downloadRoute } from "../route/export-route";
import { Info, Download } from "lucide-react";
import { MissionSummary } from "../route/MissionSummary";
import { ProjectShell } from "../../components/ProjectShell";
import { buildZoneGrid } from "../zones/classify-zones";
import { ZoneLegend } from "../zones/ZoneLegend";
import type { ZoneCell } from "../zones/zone-types";
import { useRoom } from "../session/RoomProvider";
import { LiveMissionPanel } from "./LiveMissionPanel";
import type { LiveMarker } from "./LiveMissionOverlay";
import { boardLocation, canUseObservedTerrain } from "./mission-location";
import type { PlannedObjective } from "./mission-plan";
import { advanceDustScenario, parseDustEvents, projectDustFrame, selectDustScenario,
  type DustEventCatalog, type DustScenarioSelection } from "../hazards/dust-scenario";
import { calculateMissionBudget, defaultMissionBudgetAssumptions } from "../resources/mission-budget";
import { advanceSimulationClock, initialSimulationState } from "./simulation-clock";
import { HazardScenarioPanel, type ScenarioCommand } from "./HazardScenarioPanel";
import { MissionPlannerPanel } from "./MissionPlannerPanel";
import { LimitedPlanningState } from "./LimitedPlanningState";
import "./mission-console.css";
import "./live-mission.css";
const TerrainCanvas = dynamic(
  () => import("../terrain/TerrainCanvas").then((m) => m.TerrainCanvas),
  { ssr: false },
);
export function MissionConsole() {
  const { snapshot, restoringRoom, connection } = useRoom();
  const launchedRoom = snapshot?.status === "launched" ? snapshot : null;
  const location = boardLocation(launchedRoom?.mission?.datasetId ?? launchedRoom?.missionId ?? null);
  const expectedDatasetId = !restoringRoom && launchedRoom && canUseObservedTerrain(location) ? location.coverage.datasetId : null;
  const [mission, setMission] = useState<MissionData | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!expectedDatasetId) return;
    let active = true;
    loadMission("/data/jezero", fetch, expectedDatasetId)
      .then((m) => {
        if (active) setMission(m);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [attempt, expectedDatasetId]);
  return (
    <ProjectShell current="field">
      <main className="scanner-console">
        {restoringRoom ? (
          <section className="initial-state">
            <div className="loading" role="status">
              {connection === "offline" ? "Crew connection unavailable. Retrying…" : "Restoring crew session…"}
            </div>
          </section>
        ) : !expectedDatasetId && launchedRoom ? (
          <LimitedPlanningState location={location} room={launchedRoom} />
        ) : mission && mission.datasetId === expectedDatasetId ? (
          <LoadedConsole mission={mission} />
        ) : (
          <section className="initial-state">
            {error ? (
              <>
                <TerrainFallback reason={error} />
                <button
                  className="retry"
                  onClick={() => {
                    setError("");
                    setAttempt((a) => a + 1);
                  }}
                >
                  Retry dataset
                </button>
              </>
            ) : (
              <div className="loading" role="status">
                Loading Jezero observations…
              </div>
            )}
          </section>
        )}
      </main>
    </ProjectShell>
  );
}
function useVerifiedRouteOptions(
  routeInputs: string | null, grid: HeightGrid, hazards: Hazard[], unavailable: string | null,
) {
  return useMemo(() => {
    if (!routeInputs || unavailable) return [];
    const [base, primary, optional] = JSON.parse(routeInputs) as [LocalPoint, PlannedObjective, PlannedObjective[]];
    return buildCrewRouteOptions(grid, base, primary, optional, hazards);
  }, [routeInputs, grid, hazards, unavailable]);
}

function LoadedConsole({ mission }: { mission: MissionData }) {
  const { snapshot, connection, restoringRoom, send } = useRoom();
  const liveRoom = snapshot?.status === "launched" ? snapshot : null;
  const [layers, setLayers] = useState(initialLayers),
    [state, setState] = useState(() => createRouteState(mission.presetNodes));
  const [view, setView] = useState<"orbit" | "top">("top"),
    [token, setToken] = useState(0),
    [error, setError] = useState("");
  const [display, setDisplay] = useState<TerrainDisplay>({
    mode: "surface",
    scale: 3,
    grid: true,
    contours: true,
  });
  const [scienceCategory, setScienceCategory] =
    useState<ScienceCategory>("topographic");
  const [atlas, setAtlas] = useState<
    Partial<Record<ScienceCategory, ScienceEvidenceRecord>>
  >({});
  const [previousPanel, setPreviousPanel] = useState<
    "mission" | "crew" | "hazards" | "live"
  >("mission");
  useEffect(() => {
    let active = true;
    void loadScienceAtlas("/data/jezero", mission.manifest).then((data) => {
      if (active) setAtlas(data);
    });
    return () => {
      active = false;
    };
  }, [mission]);
  const [scenarioLoad, setScenarioLoad] = useState<{ mission: MissionData; hazards: Hazard[] | null } | null>(null);
  const currentScenario = scenarioLoad?.mission === mission ? scenarioLoad : null;
  const scenario = useMemo(() => currentScenario?.hazards ?? [], [currentScenario]);
  const scenarioUnavailable = currentScenario !== null && currentScenario.hazards === null;
  const routeHazardStatus = currentScenario === null
    ? "Verifying fixed hazards for the shared route…"
    : scenarioUnavailable
      ? "Fixed hazard data unavailable. Reload to retry the shared route."
      : null;
  const [dustCatalogLoad, setDustCatalogLoad] = useState<{ mission: MissionData; catalog: DustEventCatalog | null } | null>(null);
  const dustCatalogLoading = dustCatalogLoad?.mission !== mission;
  const dustCatalog = dustCatalogLoading ? null : dustCatalogLoad.catalog;
  const simulation = liveRoom?.simulation ?? initialSimulationState;
  const { startLs, scenarioId, elapsedSol } = simulation;
  const roomCode = liveRoom?.code;
  const roomRevision = liveRoom?.revision;
  const canControl = roomCode !== undefined && connection === "online" && !restoringRoom;
  useEffect(() => {
    if (!roomCode) return;
    let active = true;
    void loadOptionalAsset("/data/jezero", "dust-events.json", mission.manifest, fetch).then((bytes) => {
      if (!active) return;
      try {
        const catalog = bytes ? parseDustEvents(JSON.parse(new TextDecoder().decode(bytes))) : null;
        setDustCatalogLoad({ mission, catalog });
      } catch {
        setDustCatalogLoad({ mission, catalog: null });
      }
    });
    return () => { active = false; };
  }, [mission, roomCode]);
  const dustSelection = useMemo<DustScenarioSelection>(() => {
    if (!roomCode || !dustCatalog) return { status: "unavailable", scenarios: [] };
    return selectDustScenario(dustCatalog, { locationId: "jezero", terrain: mission.grid,
      longitude: mission.manifest.center.longitude, latitude: mission.manifest.center.latitude }, startLs, roomCode);
  }, [roomCode, dustCatalog, mission, startLs]);
  const selectedDust = dustSelection.scenarios.find(({ id }) => id === scenarioId);
  const durationSol = selectedDust?.frames.at(-1)?.elapsedSol ?? 0;
  const dustFrame = useMemo(() => selectedDust ? advanceDustScenario(selectedDust, elapsedSol) : null, [selectedDust, elapsedSol]);
  const currentDust = useMemo(() => dustFrame ? projectDustFrame(dustFrame, mission.manifest) : null, [dustFrame, mission.manifest]);

  function scenarioCommand(command: ScenarioCommand) {
    if (!canControl || roomRevision === undefined) return;
    const revision = { code: roomCode, expectedRevision: roomRevision };
    switch (command.type) {
      case "select-scenario":
        send({ ...revision, type: "set-simulation-scenario", scenarioId: command.scenarioId, startLs });
        break;
      case "set-season":
        send({ ...revision, type: "set-simulation-scenario", scenarioId: null, startLs: command.startLs });
        break;
      case "step": {
        const next = advanceSimulationClock(simulation, command, durationSol);
        if (next.elapsedSol > elapsedSol) send({ ...revision, type: "advance-simulation", deltaSol: next.elapsedSol - elapsedSol });
        break;
      }
      case "play":
      case "pause":
        send({ ...revision, type: "set-simulation-playing", playing: command.type === "play" });
        break;
      case "reset":
        send({ ...revision, type: "reset-simulation" });
    }
  }
  const launched = !!liveRoom;
  const [dust, setDust] = useState(false),
    [radiation, setRadiation] = useState(false),
    [showHazards, setShowHazards] = useState(true);
  const [hazardFilters, setHazardFilters] = useState<HazardCategory[]>(
    hazardCategories.map((c) => c.id),
  );
  const [selectedHazardId, setSelectedHazardId] = useState<string | null>(null);
  const [showZones, setShowZones] = useState(true);
  const [selectedZone, setSelectedZone] = useState<ZoneCell | null>(null);
  const slopeHazards = useMemo(
    () => buildSlopeHazards(mission.grid),
    [mission.grid],
  );
  const scenarioSeed = liveRoom ? liveRoom.baseScenario?.seed ?? `legacy-${liveRoom.code}` : null;
  const scenarioLocation = liveRoom?.baseScenario?.locationId ?? liveRoom?.missionId ?? "jezero";
  const missionX = liveRoom?.mission?.point.x, missionY = liveRoom?.mission?.point.y;
  const crewScenario = useMemo(() => scenarioSeed !== null
    ? createCrewBaseScenario(scenarioSeed, scenarioLocation, undefined, missionX === undefined || missionY === undefined ? undefined : { x: missionX, y: missionY })
    : null, [scenarioSeed, scenarioLocation, missionX, missionY]);
  const crewHazards = useMemo<Hazard[]>(() => (crewScenario?.zones ?? []).map((zone) => {
    const categories: Record<string, HazardCategory> = { heat: "depression", dust: "dust", chemical: "sand", radiation: "rockfall", rockfall: "rockfall", storm: "dust" };
    const points = Array.from({ length: 32 }, (_, index) => {
      const angle = (index / 32) * Math.PI * 2;
      return { x: zone.center.x + Math.cos(angle) * zone.radiusX, y: zone.center.y + Math.sin(angle) * zone.radiusY };
    });
    return { id: `crew-${zone.id}`, category: categories[zone.kind] ?? "sand", scenarioKind: zone.kind, title: `${zone.label} · crew simulation`, severity: "warning", evidence: "Scenario event", marker: zone.center, geometry: { kind: "polygon", points }, description: `Illustrative ${zone.label.toLowerCase()} zone generated for crew ${liveRoom?.crewName ?? "expedition"}.`, risks: ["Simulated crew hazard zone"], precautions: ["Review the live crew scenario before planning travel."], sources: ["Crew-seeded simulation"] };
  }), [crewScenario, liveRoom?.crewName]);
  const hazards = useMemo(
    () => [
      ...scenario.filter((h) => h.category !== "dust" || (!launched && dust)),
      ...(currentDust ? [currentDust] : []),
      ...slopeHazards,
      ...crewHazards,
    ],
    [scenario, slopeHazards, crewHazards, dust, launched, currentDust],
  );
  const zones = useMemo(
    () => buildZoneGrid(mission.grid, [...scenario.filter((h) => h.category !== "dust" || (!launched && dust)), ...crewHazards]),
    [mission.grid, scenario, crewHazards, dust, launched],
  );
  useEffect(() => {
    let active = true;
    void loadOptionalAsset(
      "/data/jezero",
      "scenario.json",
      mission.manifest,
      fetch,
    ).then((bytes) => {
      if (!active) return;
      try {
        if (!bytes) throw Error();
        const document: unknown = JSON.parse(new TextDecoder().decode(bytes));
        const hazards = parseScenario(document, mission.manifest.bounds);
        const complete = Array.isArray(document) && hazards.length > 0 && hazards.length === document.length;
        setScenarioLoad({ mission, hazards: complete ? hazards : null });
      } catch {
        setScenarioLoad({ mission, hazards: null });
      }
    });
    return () => {
      active = false;
    };
  }, [mission]);
  const [activePanel, setActivePanel] = useState<
    "live" | "mission" | "crew" | "hazards" | "evidence"
  >(liveRoom?.status === "launched" ? "live" : "mission");
  const [selectedLiveMarker, setSelectedLiveMarker] = useState<LiveMarker | null>(null);
  const [liveWarning, setLiveWarning] = useState(false);
  const [liveRadiusM, setLiveRadiusM] = useState(50);
  const onLiveWarning = useCallback((warning: boolean) => setLiveWarning(warning), []);
  const [selectedCrewId, setSelectedCrewId] = useState<CrewId>("A1");
  const [followId, setFollowId] = useState<CrewId | null>(null);
  const [selectionFocus, setSelectionFocus] = useState<{
    point: LocalPoint;
    token: number;
  } | null>(null);
  const selectLiveMarker = useCallback((marker: LiveMarker) => {
    setSelectedLiveMarker(marker);
    setActivePanel("live");
    setSelectionFocus({ point: marker.point, token: Date.now() });
  }, []);
  const [inspecting, setInspecting] = useState(false);
  const [probe, setProbe] = useState<LocalPoint | null>(null);
  const [focus, setFocus] = useState<FocusCommand | null>(null);
  const [wantedTile, setWantedTile] = useState<DetailTile | null>(null);
  const [rawDetail, setRawDetail] = useState<{
    asset: string;
    grid: HeightGrid | null;
  } | null>(null);
  const [tileStatus, setTileStatus] = useState("");
  const requests = useRef(new LatestDetailRequest());
  const manual = useRef(false);
  const onManual = useCallback(() => {
    manual.current = true;
    setFollowId(null);
    setSelectionFocus(null);
    setFocus(null);
  }, []);
  const onNavigate = useCallback(
    (point: LocalPoint, span: number) => {
      if (!manual.current) return;
      setWantedTile(
        chooseDetailTile(mission.manifest.detailTiles ?? [], null, point, span),
      );
    },
    [mission],
  );
  useEffect(() => {
    const tracker = requests.current;
    if (!wantedTile) {
      tracker.cancel();
      return;
    }
    void tracker
      .run(() => loadDetailTile("/data/jezero", mission.manifest, wantedTile))
      .then((grid) => {
        if (grid === undefined) return;
        setRawDetail({ asset: wantedTile.asset, grid });
        setTileStatus(
          grid
            ? `Site ${wantedTile.stopId} · 1 m detail`
            : `Site ${wantedTile.stopId} detail unavailable · overview retained`,
        );
      });
    return () => tracker.cancel();
  }, [wantedTile, mission]);
  const [detailGrid, setDetailGrid] = useState(mission.grid);
  const activeDetail = useMemo(
    () =>
      rawDetail?.asset === wantedTile?.asset && rawDetail?.grid
        ? stitchDetailEdge(rawDetail.grid, detailGrid)
        : null,
    [rawDetail, detailGrid, wantedTile],
  );
  const [scalars, setScalars] = useState<ScalarLayers>({});
  const [optical, setOptical] = useState<HTMLImageElement | null | undefined>(
    undefined,
  );
  const physical = display.mode === "physical";
  const activeDisplay: TerrainDisplay = physical
    ? { ...display, scale: 1, grid: false, contours: false }
    : display;
  const activeLayers = physical
    ? { ...layers, optical: { visible: true, opacity: 1 } }
    : layers;
  const wantsOptical = activeLayers.optical.visible;
  const workspace = useRef<HTMLDivElement>(null);
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [expandedFallback, setExpandedFallback] = useState(false);
  useEffect(() => {
    const sync = () =>
      setNativeFullscreen(document.fullscreenElement === workspace.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  useEffect(() => {
    if (!expandedFallback) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedFallback(false);
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [expandedFallback]);
  async function toggleFullscreen() {
    if (nativeFullscreen) {
      await document.exitFullscreen().catch(() => {});
    } else if (expandedFallback) {
      setExpandedFallback(false);
    } else if (workspace.current) {
      try {
        await workspace.current.requestFullscreen();
      } catch {
        setExpandedFallback(true);
      }
    }
  }
  useEffect(() => {
    if (!wantsOptical || optical !== undefined) return;
    const image = new Image();
    image.onload = () => setOptical(image);
    image.onerror = () => setOptical(null);
    image.src = "/data/jezero/optical.webp";
    return () => {
      image.onload = null;
      image.onerror = null;
    };
  }, [wantsOptical, optical]);
  const elevationRange = useMemo(
    () => getElevationRange(detailGrid),
    [detailGrid],
  );
  const colorStops = useMemo(
    () =>
      layers.analysis === "none"
        ? []
        : getColorStops(layers.analysis, mission.manifest, elevationRange),
    [layers.analysis, mission.manifest, elevationRange],
  );
  useEffect(() => {
    let active = true;
    const base = "/data/jezero";
    if (window.innerWidth >= 700)
      void loadDisplayGrid(base, mission).then((grid) => {
        if (active) setDetailGrid(grid);
      });
    for (const mode of ["slope", "thermal"] as const) {
      void loadScalarLayer(base, mode, mission.manifest).then((bytes) => {
        if (active) setScalars((current) => ({ ...current, [mode]: bytes }));
      });
    }
    return () => {
      active = false;
    };
  }, [mission]);
  const [editing, setEditing] = useState(false),
    [mode, setMode] = useState<EditMode>("insert"),
    [selectedId, setSelectedId] = useState(""),
    [edgeId, setEdgeId] = useState(mission.presetNodes[0].id);
  const [selectedStopId, setSelectedStopId] = useState<StopId>("A"),
    [focusedSample, setFocusedSample] = useState<number | null>(null);
  const sourceButton = useRef<HTMLButtonElement>(null);
  const nodes = useMemo(() => resolveNodes(state), [state]);
  const result = useMemo(
    () => calculateRoute(mission.grid, nodes, state.assumptions),
    [mission.grid, nodes, state.assumptions],
  );
  const selectedPlan = liveRoom?.expeditionPlan;
  const optionalObjectives = liveRoom?.quests.filter((quest) =>
    quest.id !== liveRoom.mission?.id && quest.datasetId === mission.datasetId
    && (quest.status === "published" || quest.status === "accepted"),
  ) ?? [];
  const orderedObjectives = selectedPlan?.optionalObjectiveIds.map((id) => {
    const quest = optionalObjectives.find((item) => item.id === id);
    return quest && { id: quest.id, point: { x: quest.point.x, y: quest.point.y }, durationMin: quest.durationMin };
  }) ?? [];
  // The shared route uses room-seeded hazards and the mapped slope. Local what-if
  // controls may change the display without changing another crew member's route.
  const planningHazards = useMemo(() => [...scenario.filter((hazard) => hazard.category !== "dust"), ...crewHazards], [scenario, crewHazards]);
  // Use a stable value key so unrelated position and resource updates do not rerun A*.
  const routeInputs = liveRoom?.base && liveRoom.mission && liveRoom.mission.id === selectedPlan?.primaryObjectiveId
    && orderedObjectives.every((objective) => objective !== undefined)
    ? JSON.stringify([
      liveRoom.base,
      { id: liveRoom.mission.id, point: liveRoom.mission.point },
      orderedObjectives.map((objective) => ({ id: objective!.id, point: objective!.point })),
    ])
    : null;
  const routeOptions = useVerifiedRouteOptions(routeInputs, mission.grid, planningHazards, routeHazardStatus);
  const crewRoute = routeOptions.find(({ id }) => id === selectedPlan?.routePreference);
  const hazardFrames = useMemo(() => [
    ...planningHazards.map((hazard) => ({ elapsedSol: 0, hazard })),
    // Forecast from the departure frame. An empty footprint clears any
    // previous dust exposure when a later frame leaves the mapped sector.
    ...(selectedDust && dustFrame ? [dustFrame, ...selectedDust.frames.filter((frame) => frame.elapsedSol > elapsedSol)]
      .map((frame) => ({
        elapsedSol: frame.elapsedSol - elapsedSol,
        hazard: projectDustFrame(frame, mission.manifest) ?? {
          id: "simulation-dust", category: "dust" as const, title: "Dust outside mapped sector",
          evidence: "Scenario event" as const, severity: "caution" as const,
          marker: { x: 0, y: 0 }, geometry: { kind: "cells" as const, cells: [] },
          description: "", risks: [], precautions: [], sources: [],
        },
      })) : []),
  ], [planningHazards, selectedDust, dustFrame, elapsedSol, mission.manifest]);
  const budgetInputs = liveRoom && JSON.stringify({
    crew: liveRoom.members.flatMap(({ id }) => liveRoom.resources[id] ? [{ id, ...liveRoom.resources[id] }] : []),
    objectiveDurationsMin: Object.fromEntries([liveRoom.mission, ...orderedObjectives].flatMap((objective) =>
      objective ? [[objective.id, objective.durationMin]] : [])),
  });
  const budgets = useMemo(() => {
    if (!budgetInputs || (scenarioId && !dustFrame)) return { efficient: null, "lower-exposure": null };
    const inputs = JSON.parse(budgetInputs) as Pick<Parameters<typeof calculateMissionBudget>[0], "crew" | "objectiveDurationsMin">;
    const estimate = (route: (typeof routeOptions)[number] | undefined) => route
      ? calculateMissionBudget({ ...inputs, route, grid: mission.grid, assumptions: defaultMissionBudgetAssumptions, hazardFrames })
      : null;
    return {
      efficient: estimate(selectedPlan?.routePreference === "efficient" ? crewRoute : routeOptions.find(({ id }) => id === "efficient")),
      "lower-exposure": estimate(selectedPlan?.routePreference === "lower-exposure" ? crewRoute : routeOptions.find(({ id }) => id === "lower-exposure")),
    };
  }, [budgetInputs, scenarioId, dustFrame, routeOptions, selectedPlan?.routePreference, crewRoute, mission.grid, hazardFrames]);
  const selectedBudget = crewRoute ? budgets[crewRoute.id] : null;
  const dustExposedEdges = useMemo(() => selectedBudget?.exposedSegments
    .filter(({ hazardIds }) => hazardIds.includes("simulation-dust")).map(({ legIndex }) => legIndex) ?? [], [selectedBudget]);

  const liveExposure = useMemo(() => crewRoute && { route: crewRoute, legIndexes: dustExposedEdges }, [crewRoute, dustExposedEdges]);
  const timelines = useMemo(
    () => buildTeamTimelines(nodes, state.assumptions),
    [nodes, state.assumptions],
  );
  const playback = useCrewPlayback(
    timelines,
    JSON.stringify([nodes, state.assumptions]),
  );
  const followed = followId
    ? playback.states.find((s) => s.member.id === followId)?.point
    : null;
  const conflicts = useMemo(
    () =>
      launched ? routeHazardConflicts(crewRoute?.nodes ?? [], planningHazards).map((conflict) => ({ ...conflict, team: "Crew route" })) : timelines.flatMap((t) =>
        routeHazardConflicts(t.nodes, hazards).map((c) => ({
          ...c,
          team: t.teamId,
        })),
      ),
    [timelines, hazards, launched, crewRoute, planningHazards],
  );
  useEffect(() => {
    if (!followId || !followed) return;
    const frame = requestAnimationFrame(() =>
      setWantedTile(
        chooseDetailTile(
          mission.manifest.detailTiles ?? [],
          null,
          followed,
          600,
        ),
      ),
    );
    return () => cancelAnimationFrame(frame);
  }, [followId, followed, mission]);
  function selectScience(category: ScienceCategory) {
    setScienceCategory(category);
    setEditing(false);
    setInspecting(false);
    setFollowId(null);
    if (
      [
        "atmospheric",
        "spectral",
        "geophysical",
        "radiation",
        "chemical",
      ].includes(category)
    ) {
      if (activePanel !== "evidence") setPreviousPanel(activePanel);
      setActivePanel("evidence");
    } else {
      setActivePanel(previousPanel);
      if (category === "optical")
        setLayers((current) => updateOptical(current, { visible: true }));
      if (category === "thermal")
        setLayers((current) => selectAnalysis(current, "thermal"));
      if (category === "topographic")
        setLayers((current) => selectAnalysis(current, "elevation"));
    }
  }
  function selectHazard(id: string) {
    setSelectedHazardId(id);
    setActivePanel("hazards");
    setEditing(false);
    setInspecting(false);
    setFollowId(null);
  }
  function selectCrew(id: CrewId) {
    setActivePanel("crew");
    setSelectedCrewId(id);
    setEditing(false);
    setInspecting(false);
    setFollowId(null);
    setFocus(null);
    const point = playback.states.find((s) => s.member.id === id)!.point;
    setSelectionFocus({ point, token: Date.now() });
    setWantedTile(
      chooseDetailTile(mission.manifest.detailTiles ?? [], null, point, 600),
    );
  }
  function onAction(action: RouteAction) {
    const r = applyRouteAction(state, action, mission.grid);
    if (!r.ok) {
      setError(r.error);
      return false;
    }
    setState(r.value);
    playback.restart("Route changed — playback restarted");
    setFollowId(null);
    setFocusedSample(null);
    setError("");
    const resolved = resolveNodes(r.value);
    if (!resolved.slice(0, -1).some((n) => n.id === edgeId))
      setEdgeId(resolved[0].id);
    return true;
  }
  function focusStop(stopId: StopId) {
    setFollowId(null);
    setSelectionFocus(null);
    const stop = mission.stops.find((s) => s.id === stopId)!;
    setSelectedStopId(stopId);
    manual.current = false;
    setFocus({ point: stop.point, stopId, token: Date.now() });
    setWantedTile(
      chooseDetailTile(
        mission.manifest.detailTiles ?? [],
        stopId,
        stop.point,
        0,
      ),
    );
  }
  function onPick(point: LocalPoint) {
    if (inspecting) {
      setProbe(point);
      return;
    }
    if (!editing) return;
    if (mode === "move") {
      onAction({ type: "move", id: selectedId, point });
    } else {
      const id = "w-" + crypto.randomUUID().slice(0, 6);
      if (onAction({ type: "insert", afterNodeId: edgeId, id, point }))
        setSelectedId(id);
    }
  }
  if (!result.ok && !launched) return <TerrainFallback reason={result.error} />;
  const summary = result.ok ? result.value : { distanceM: 0, ascentM: 0, durationMin: 0, remainingMin: 0, samples: [] };
  return (
    <div
      className={
        ["workspace", launched && "workspace-planning", expandedFallback && "workspace-expanded"].filter(Boolean).join(" ")
      }
      ref={workspace}
    >
      <div className="atlas-rail" id="data-views" aria-label="Data views and map layers">
        <div className="data-view-heading">DATA VIEWS</div>
        <ScienceAtlasPanel
          selected={scienceCategory}
          onSelect={selectScience}
        />
        <LayerPanel
          settings={activeLayers}
          opticalLocked={physical}
          colorStops={colorStops}
          meshSpacing={activeDetail?.cellSizeM ?? detailGrid.cellSizeM}
          opticalUnavailable={optical === null}
          availability={{
            slope:
              scalars.slope === undefined ? undefined : scalars.slope !== null,
            thermal:
              scalars.thermal === undefined
                ? undefined
                : scalars.thermal !== null,
          }}
          onOptical={(patch) => {
            if (patch.visible && optical === null) setOptical(undefined);
            setLayers((current) => updateOptical(current, patch));
          }}
          onAnalysis={(analysis) =>
            setLayers((current) => selectAnalysis(current, analysis))
          }
          onOpacity={(analysisOpacity) =>
            setLayers((current) => ({ ...current, analysisOpacity }))
          }
        />
      </div>
      <section className="map-column" aria-label="Martian terrain">
        <div className="expedition-toolbar">
          <TerrainToolbar
            inspecting={inspecting}
            onInspect={() => {
              setInspecting(!inspecting);
              setEditing(false);
            }}
            view={view}
            display={activeDisplay}
            onView={setView}
            onDisplay={(patch) => {
              if (patch.mode === "physical" && optical === null)
                setOptical(undefined);
              setDisplay((current) => ({ ...current, ...patch }));
            }}
            onReset={() => {
              setFocus(null);
              setFollowId(null);
              setSelectionFocus(null);
              setWantedTile(null);
              manual.current = false;
              setToken((current) => current + 1);
            }}
            expanded={nativeFullscreen || expandedFallback}
            onExpand={() => void toggleFullscreen()}
          />
          <MapLegend />
          <button aria-pressed={showZones} onClick={() => setShowZones((value) => !value)}>
            Terrain zones
          </button>
          {launched && <a className="mobile-data-link" href="#planning-controls">Mission planner ↓</a>}
          <a className="mobile-data-link" href="#data-views">Data views ↓</a>
        </div>
        <div className={editing ? "map-viewport editing" : "map-viewport"}>
          <TerrainCanvas
            liveMarkers={liveRoom ? [
              ...(liveRoom.base ? [{ id: "crew-base", kind: "base" as const, label: "CREW BASE", point: liveRoom.base }] : []),
              ...(liveRoom.mission ? [{ id: liveRoom.mission.id, kind: "quest" as const, label: liveRoom.mission.title, point: liveRoom.mission.point, active: true }] : []),
              ...liveRoom.members.flatMap((member) => liveRoom.positions[member.id] ? [{ id: member.id, kind: "member" as const, label: member.name, point: liveRoom.positions[member.id], avatar: member.avatar }] : []),
              ...liveRoom.quests.filter((quest) => quest.id !== liveRoom.mission?.id && ["published", "accepted", "in-progress"].includes(quest.status)).map((quest) => ({ id: quest.id, kind: "quest" as const, label: quest.title, point: quest.point, active: liveRoom.activeQuestIds.includes(quest.id) || selectedPlan?.optionalObjectiveIds.includes(quest.id) })),
            ] : undefined}
            liveExposure={liveExposure}
            liveRadiusM={liveRadiusM}
            onLiveSelect={selectLiveMarker}
            zones={showZones && zones ? zones : undefined}
            onZoneSelect={(cell) => setSelectedZone(cell)}
            hazards={
              showHazards
                ? hazards.filter((h) => hazardFilters.includes(h.category))
                : []
            }
            selectedHazardId={selectedHazardId}
            onHazardSelect={selectHazard}
            crew={liveRoom?.status === "launched" ? undefined : {
              timelines,
              clockRef: playback.clockRef,
              states: playback.states,
              selectedId: selectedCrewId,
              onSelect: selectCrew,
            }}
            followPoint={followed}
            selectionFocus={selectionFocus}
            mission={mission}
            grid={detailGrid}
            detail={activeDetail}
            focus={focus}
            onNavigate={onNavigate}
            onManual={onManual}
            scalars={scalars}
            optical={optical ?? null}
            colorStops={colorStops}
            display={activeDisplay}
            view={view}
            token={token}
            layers={activeLayers}
            summary={launched ? crewRoute?.summary ?? undefined : summary}
            nodes={launched ? crewRoute?.nodes : nodes}
            showRouteNodes={!launched}
            includePresetStops={!launched}
            onPick={(!launched && editing) || inspecting ? onPick : undefined}
            focusedSample={focusedSample}
            onSelect={(n) => {
              if (n.stopId) focusStop(n.stopId);
              if (n.kind === "waypoint") {
                setInspecting(false);
                setSelectedId(n.id);
                setMode("move");
                setEditing(true);
              }
            }}
          />
          {inspecting && (
            <div className="probe-card" role="status">
              <strong>Terrain inspector</strong>
              {probe ? (
                <>
                  <p>
                    {probe.x.toFixed(0)} E / {probe.y.toFixed(0)} N m
                  </p>
                  <TerrainReadout
                    reading={inspectTerrain(
                      probe,
                      mission.grid,
                      scalars.thermal ?? null,
                    )}
                  />
                </>
              ) : (
                <p>
                  Click terrain to sample elevation, slope and IR brightness.
                </p>
              )}
            </div>
          )}
          <div className="map-instructions">
            {inspecting
              ? "Inspect mode · Click terrain for readings"
              : editing
                ? mode === "insert"
                  ? "Click terrain to add a waypoint"
                  : "Select a waypoint, then click its new location"
                : view === "top"
                  ? "Drag to pan · Scroll to zoom"
                  : "Drag to orbit · Scroll to zoom"}
          </div>
          {(display.mode === "points" || display.mode === "mesh") &&
            layers.analysis !== "none" && (
              <button
                className="scanner-heat-shortcut"
                onClick={() =>
                  setDisplay((current) => ({ ...current, mode: "surface" }))
                }
              >
                Show heat map on surface
              </button>
            )}
          <span className="scanner-map-tag">
            {physical
              ? optical
                ? "HiRISE imagery · Warm tint"
                : "Physical relief · True scale"
              : "JEZERO / HIRES RELIEF"}
          </span>
          {view === "top" && (
            <span className="scanner-north" aria-label="North up">
              N ↑
            </span>
          )}
        </div>
        {showZones && <ZoneLegend selected={selectedZone} />}
        <div className="map-caption">
          <span role="status">
            {activeDetail
              ? tileStatus
              : wantedTile &&
                  rawDetail?.asset === wantedTile.asset &&
                  rawDetail.grid === null
                ? tileStatus
                : `${detailGrid.cellSizeM} m mesh`}{" "}
            · Relief {activeDisplay.scale}×
          </span>
          <span>
            <i className="route-key" />
            {launched ? "Terrain-weighted route candidate" : "Route"} <i className="caution-key" />
            Slope &gt;15° (demo)
          </span>
          {launched && <span role="status" data-testid="crew-route-status"
            data-dust-exposed-segments={crewRoute && JSON.stringify(dustExposedEdges)}
            data-route-preference={crewRoute?.id}
            data-route-nodes={crewRoute && JSON.stringify(crewRoute.nodes)}
            data-route-start={crewRoute && JSON.stringify(crewRoute.nodes[0].point)}
            data-route-end={crewRoute && JSON.stringify(crewRoute.nodes.at(-1)?.point)}>
            {crewRoute?.summary
              ? `${Math.round(crewRoute.summary.distanceM)} m round trip · based on mapped slope and crew hazards · illustrative candidate`
              : routeHazardStatus ?? (!liveRoom?.base || !liveRoom.mission
                ? "Select a crew base and mission point to calculate a route candidate."
                : "No terrain-weighted route supports the full round trip.")}
          </span>}
          {dustExposedEdges.length > 0 && <span><i className="dust-route-key" /> Dust-exposed route segments · simulated</span>}
          <span>
            {activeDisplay.grid ? "100 m grid · " : ""}
            {activeDisplay.contours ? "10 m contours" : "2.048 km extent"}
          </span>
        </div>
        {(!launched || crewRoute) && <details className="map-detail-tray"><summary>{launched ? "Round-trip elevation profile" : "Playback and elevation profile"}</summary>
          {!launched && <PlaybackBar playback={playback} />}
          <ElevationProfile samples={launched ? crewRoute!.summary.samples : summary.samples} focusedSample={focusedSample} onSampleFocus={setFocusedSample} />
        </details>}
        <div className="map-bottom">
          <span>{launched ? "Derived terrain from NASA HiRISE stereo observations · measured imagery in Physical view." : "Observed terrain. Hypothetical expedition."}</span>
          <button ref={sourceButton} popoverTarget="source-drawer">
            <Info size={14} />
            Sources & assumptions
          </button>
        </div>
      </section>
      <aside className="mission-panel">
        {liveRoom && selectedPlan && (
          <div className="planning-controls" id="planning-controls">
            <MissionPlannerPanel room={liveRoom} plan={selectedPlan} routes={routeOptions} budgets={budgets}
              assumptions={defaultMissionBudgetAssumptions} dust={currentDust} dustFrameAvailable={!scenarioId || !!dustFrame}
              coverage={mission.manifest.coverage} routeHazardStatus={routeHazardStatus} optionalObjectives={optionalObjectives} />
            <HazardScenarioPanel selection={dustSelection} frame={dustFrame} state={simulation}
              loading={dustCatalogLoading} disabled={!canControl} playbackAvailable={liveRoom.members.some(({ isHost, connected }) => isHost && connected)} onCommand={scenarioCommand} />
          </div>
        )}
        {liveWarning && activePanel !== "live" && <button className="live-alert-switch" onClick={() => setActivePanel("live")}>Crew separation · open status</button>}
        <div className="mission-tabs" role="tablist" aria-label="Mission views">
          {(["live", "mission", "crew", "hazards"] as const).filter((panel) => !launched || panel !== "crew").map((panel) => (
            <button
              key={panel}
              role="tab"
              aria-selected={activePanel === panel}
              onClick={() => setActivePanel(panel)}
            >
              {launched ? { live: "Crew", mission: "Evidence", crew: "Crew", hazards: "Map hazards" }[panel] : panel[0].toUpperCase() + panel.slice(1)}
            </button>
          ))}
        </div>
        <div hidden={activePanel !== "live"}><LiveMissionPanel optionalObjectives={optionalObjectives} selectedMarker={selectedLiveMarker} onSelectMarker={selectLiveMarker} onWarning={onLiveWarning} radiusM={liveRadiusM} onRadius={setLiveRadiusM} radiation={radiation} onRadiation={setRadiation} /></div>
        {activePanel === "evidence" && (
          <div>
            <button
              className="evidence-back"
              onClick={() => setActivePanel(previousPanel)}
            >
              Back to {previousPanel}
            </button>
            {scienceCategory === "atmospheric" ? (
              <ExpeditionEvidence manifest={mission.manifest} />
            ) : atlas[scienceCategory] ? (
              <ScienceEvidence
                key={scienceCategory}
                record={atlas[scienceCategory]!}
                manifest={mission.manifest}
              />
            ) : (
              <section className="science-evidence">
                <h2>{scienceCategory} evidence</h2>
                <p>
                  Evidence archive unavailable. The crew simulation and terrain
                  remain available.
                </p>
              </section>
            )}
          </div>
        )}
        {!launched && activePanel === "crew" && (
          <CrewPanel
            states={playback.states}
            timelines={timelines}
            warnings={hazards
              .filter((h) =>
                pointInHazard(
                  playback.states.find((s) => s.member.id === selectedCrewId)!
                    .point,
                  h,
                ),
              )
              .map((h) => h.title)}
            selectedId={selectedCrewId}
            followId={followId}
            onSelect={selectCrew}
            onFollow={(id) => {
              setFollowId(id);
              setFocus(null);
              if (id)
                setSelectionFocus({
                  point: playback.states.find((s) => s.member.id === id)!.point,
                  token: Date.now(),
                });
            }}
          />
        )}
        {activePanel === "hazards" && (
          <HazardPanel
            hazards={hazards}
            selectedId={selectedHazardId}
            onSelect={selectHazard}
            conflicts={conflicts}
            dust={launched ? !!currentDust : dust}
            onDust={launched ? undefined : setDust}
            visible={showHazards}
            onVisible={setShowHazards}
            filters={hazardFilters}
            onFilter={(id) =>
              setHazardFilters((current) =>
                current.includes(id)
                  ? current.filter((c) => c !== id)
                  : [...current, id],
              )
            }
            unavailable={scenarioUnavailable}
            onFocus={() => {
              const h = hazards.find((h) => h.id === selectedHazardId);
              if (h) {
                setFocus(null);
                setSelectionFocus({ point: h.marker, token: Date.now() });
              }
            }}
          />
        )}
        {launched ? <div hidden={activePanel !== "mission"}><ExpeditionEvidence manifest={mission.manifest} /></div> : <div hidden={activePanel !== "mission"}>
          <MissionSummary summary={summary} assumptions={state.assumptions} />
          <QuestJournal
            mission={mission}
            nodes={nodes}
            assumptions={state.assumptions}
            thermal={scalars.thermal ?? null}
            selectedStopId={selectedStopId}
            includedStopIds={state.includedStopIds}
            onSelect={focusStop}
            onInclude={(stopId, included) =>
              onAction({ type: "set-stop-included", stopId, included })
            }
          />
          <RouteEditor
            state={state}
            onAction={onAction}
            editing={editing}
            setEditing={(value) => {
              setEditing(value);
              if (value) setInspecting(false);
            }}
            mode={mode}
            setMode={setMode}
            selectedId={selectedId}
            setSelectedId={setSelectedId}
            edgeId={edgeId}
            setEdgeId={setEdgeId}
          />
          <ExpeditionEvidence manifest={mission.manifest} />
          {error && (
            <p className="action-error" role="alert">
              {error}
            </p>
          )}
          <AssumptionEditor
            key={JSON.stringify(state.assumptions)}
            value={state.assumptions}
            onApply={(a) =>
              onAction({ type: "set-assumptions", assumptions: a })
            }
          />
          <button
            className="export-button"
            onClick={() =>
              downloadRoute(makeRouteExport(mission, state, summary))
            }
          >
            <Download size={15} />
            Export route
          </button>
          <div className="note">
            Archival observations. Habitat and field stations are hypothetical.
            Straight route segments do not avoid obstacles automatically.
          </div>
        </div>}
      </aside>
      <SourceDrawer
        manifest={mission.manifest}
        onClose={() => {
          document.getElementById("source-drawer")?.hidePopover();
          sourceButton.current?.focus();
        }}
      />
    </div>
  );
}
export function AssumptionEditor({
  value,
  onApply,
}: {
  value: Assumptions;
  onApply: (a: Assumptions) => void;
}) {
  const [speed, setSpeed] = useState(String(value.speedMps)),
    [allowance, setAllowance] = useState(String(value.allowanceMin)),
    [dwell, setDwell] = useState(String(value.dwellMin));
  const number = (s: string) => (s.trim() ? Number(s) : NaN);
  return (
    <details className="assumptions">
      <summary>Adjust demo assumptions</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onApply({
            speedMps: number(speed),
            allowanceMin: number(allowance),
            dwellMin: number(dwell),
          });
        }}
      >
        <label>
          Walking speed (m/s)
          <input
            aria-label="Walking speed"
            type="number"
            step="any"
            value={speed}
            onChange={(e) => setSpeed(e.target.value)}
          />
        </label>
        <label>
          Time allowance (min)
          <input
            aria-label="Time allowance"
            type="number"
            step="any"
            value={allowance}
            onChange={(e) => setAllowance(e.target.value)}
          />
        </label>
        <label>
          Time per science stop (min)
          <input
            aria-label="Time per science stop"
            type="number"
            step="any"
            value={dwell}
            onChange={(e) => setDwell(e.target.value)}
          />
        </label>
        <button type="submit">Apply assumptions</button>
      </form>
      <p className="fine">
        Duration = horizontal distance ÷ speed + science dwell. These are
        illustrative values, not a validated suit model.
      </p>
    </details>
  );
}
