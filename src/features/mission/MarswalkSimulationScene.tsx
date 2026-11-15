"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { RotateCcw } from "lucide-react";
import type { Group } from "three";
import { AstronautModel } from "../crew/AstronautModel";
import type { CrewActivity } from "../crew/crew-timeline";
import { HabitatModel } from "../crew/HabitatModel";
import type { Hazard } from "../hazards/hazard-types";
import type { CrewRouteOption } from "../route/crew-route";
import type { RoomMember } from "../session/protocol";
import { sampleDisplayedPosition } from "../terrain/detail-surface";
import { TerrainCanvas } from "../terrain/TerrainCanvas";
import type { ReliefScale, TerrainMode } from "../terrain/terrain-display";
import { getColorStops } from "../terrain/terrain-style";
import type { RasterMode, SurfaceScalars } from "../terrain/surface-raster";
import { sampleWalk, type WalkTimeline } from "./marswalk-simulation";
import type { LocalPoint, MissionData } from "./types";

const noAction = () => {};
const accents = ["#b7e7d2", "#eca878", "#a4c6ef", "#d3b3eb", "#e8cb85"];
const zeroFeet = (): [number, number] => [0, 0];

export function MarswalkSimulationScene({
  mission, route, timeline, minute, playing, members, hazards, layer, opacity,
  slope, thermal, fallback,
}: {
  mission: MissionData;
  route: CrewRouteOption;
  timeline: WalkTimeline;
  minute: number;
  playing: boolean;
  members: RoomMember[];
  hazards: Hazard[];
  layer: RasterMode | "optical";
  opacity: number;
  slope: SurfaceScalars["slope"];
  thermal: SurfaceScalars["thermal"];
  fallback: ReactNode;
}) {
  const [view, setView] = useState<"orbit" | "top">("orbit");
  const [mode, setMode] = useState<TerrainMode>("surface");
  const [scale, setScale] = useState<ReliefScale>(3);
  const [gridVisible, setGridVisible] = useState(false);
  const [contours, setContours] = useState(false);
  const [follow, setFollow] = useState(true);
  const [token, setToken] = useState(0);
  const [optical, setOptical] = useState<HTMLImageElement | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const visualPoint = useRef<LocalPoint | null>(route.nodes[0]?.point ?? null);
  const getFollowPoint = useCallback(() => follow ? visualPoint.current : null, [follow]);
  const updateVisualPoint = useCallback((point: LocalPoint) => { visualPoint.current = point; }, []);
  useEffect(() => {
    const image = new Image();
    image.onload = () => setOptical(image);
    image.onerror = () => setImageFailed(true);
    image.src = "/data/jezero/optical.webp";
    return () => { image.onload = null; image.onerror = null; };
  }, []);
  const analysis = layer === "topographic" ? "elevation" : layer === "optical" ? "none" : layer;
  const colorStops = useMemo(
    () => analysis === "none" ? [] : getColorStops(analysis, mission.manifest),
    [analysis, mission.manifest],
  );
  const datum = mission.manifest.elevationRangeM[0];
  const base = route.nodes[0]?.point;
  const scenery = mode === "physical" && layer !== "optical" ? "surface" : mode;
  const relief = scenery === "physical" ? 1 : scale;
  const selectionFocus = useMemo(
    () => base ? { point: base, token } : null,
    [base, token],
  );
  const stopMarkers = useMemo(() => route.nodes.filter(node => node.kind === "stop"), [route]);
  const reset = () => { setFollow(true); setToken(value => value + 1); };
  return <div className="simulation-terrain">
    <div className="simulation-terrain-controls" aria-label="Terrain controls">
      <div role="group" aria-label="Camera view">
        <button aria-pressed={view === "orbit"} onClick={() => setView("orbit")}>Orbit</button>
        <button aria-pressed={view === "top"} onClick={() => setView("top")}>Top down</button>
        <button aria-pressed={follow} onClick={() => setFollow(!follow)}>Follow crew</button>
        <button aria-label="Reset camera" title="Reset camera" onClick={reset}><RotateCcw size={15} /></button>
      </div>
      <label>Terrain <select aria-label="Terrain" value={scenery} onChange={event => setMode(event.target.value as TerrainMode)}>
        <option value="surface">Surface</option>
        <option value="physical" disabled={layer !== "optical"}>Physical</option>
        <option value="mesh">Mesh</option>
        <option value="points">Points</option>
      </select></label>
      <label>Relief <select aria-label="Relief" disabled={scenery === "physical"} value={relief} onChange={event => setScale(Number(event.target.value) as ReliefScale)}>
        <option value={1}>1×</option><option value={3}>3×</option><option value={5}>5×</option>
      </select></label>
      <div role="group" aria-label="Terrain overlays">
        <button disabled={scenery === "physical"} aria-pressed={gridVisible} onClick={() => setGridVisible(!gridVisible)}>Grid</button>
        <button disabled={scenery === "physical"} aria-pressed={contours} onClick={() => setContours(!contours)}>Contours</button>
      </div>
    </div>
    <div className="simulation-terrain-viewport" role="region" aria-label="3D Jezero expedition terrain">
      <TerrainCanvas
        mission={mission} grid={mission.grid} display={{ mode: scenery, scale: relief, grid: gridVisible, contours }}
        optical={optical} scalars={{ slope, thermal }} colorStops={colorStops}
        layers={{ optical: { visible: true, opacity: 1 }, analysis, analysisOpacity: opacity }}
        view={view} token={token} selectionFocus={selectionFocus} getFollowPoint={getFollowPoint}
        onManual={() => setFollow(false)} onNavigate={noAction} hazards={hazards}
        summary={route.summary} nodes={route.nodes} showRouteNodes={false} includePresetStops={false} fallback={fallback}
      >
        <MovingCrew mission={mission} timeline={timeline} minute={minute} playing={playing} members={members} relief={relief} onPosition={updateVisualPoint} />
        {base && <TerrainLandmark mission={mission} point={base} datum={datum} relief={relief} habitat />}
        {stopMarkers.map(node => <TerrainLandmark key={node.id} mission={mission} point={node.point} datum={datum} relief={relief} />)}
      </TerrainCanvas>
      {imageFailed && <p className="simulation-terrain-message" role="status">Optical imagery unavailable. Showing the elevation surface.</p>}
    </div>
  </div>;
}

function TerrainLandmark({ mission, point, datum, relief, habitat }: {
  mission: MissionData; point: LocalPoint; datum: number; relief: ReliefScale; habitat?: boolean;
}) {
  const position = sampleDisplayedPosition(point, mission.grid, null, datum, relief, habitat ? 1 : 8);
  if (!position) return null;
  return <group position={position}>
    {habitat ? <HabitatModel /> : <mesh><octahedronGeometry args={[8]} /><meshBasicMaterial color="#e8cb85" /></mesh>}
  </group>;
}

function MovingCrew({ mission, timeline, minute, playing, members, relief, onPosition }: {
  mission: MissionData; timeline: WalkTimeline; minute: number; playing: boolean;
  members: RoomMember[]; relief: ReliefScale; onPosition: (point: LocalPoint) => void;
}) {
  const groups = useRef(new Map<string, Group>());
  const animation = useRef({ from: minute, to: minute, seconds: 0 });
  const activity = useRef<CrewActivity>("waiting");
  const reduced = useMemo(() => matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const invalidate = useThree(state => state.invalidate);
  const datum = mission.manifest.elevationRangeM[0];
  useFrame((_, delta) => {
    const clock = animation.current;
    if (minute !== clock.to) {
      clock.from = clock.to;
      clock.to = minute;
      clock.seconds = 0;
    }
    clock.seconds += Math.min(delta, 0.05);
    const t = reduced || !playing ? 1 : Math.min(1, clock.seconds / 0.25);
    const sample = sampleWalk(timeline, clock.from + (clock.to - clock.from) * t);
    onPosition(sample.point);
    activity.current = sample.action?.kind === "science" ? "science" : playing ? "walking" : "waiting";
    const action = sample.action;
    const heading = action?.kind === "travel" ? Math.atan2(action.to.x - action.from.x, action.from.y - action.to.y) : null;
    members.forEach((member, index) => {
      const root = groups.current.get(member.id);
      if (!root) return;
      const point = { x: sample.point.x + (index - (members.length - 1) / 2) * 14, y: sample.point.y };
      const position = sampleDisplayedPosition(point, mission.grid, null, datum, relief, 1)
        ?? sampleDisplayedPosition(sample.point, mission.grid, null, datum, relief, 1);
      root.visible = !!position;
      if (position) root.position.set(...position);
      if (heading !== null) root.rotation.y = heading;
    });
    if (playing && !reduced) invalidate();
  }, -1);
  return <group>{members.map((member, index) => <group
    key={member.id}
    ref={root => { if (root) groups.current.set(member.id, root); else groups.current.delete(member.id); }}
    scale={9}
  >
    <AstronautModel accent={accents[index % accents.length]} activity={() => activity.current} playing={() => playing}
      reducedMotion={reduced} footHeights={zeroFeet} onSelect={noAction} />
  </group>)}</group>;
}
