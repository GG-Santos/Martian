"use client";
import { Component, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { CameraController } from "./CameraController";
import { HazardOverlay } from "../hazards/HazardOverlay";
import type { Hazard } from "../hazards/hazard-types";
import { CrewOverlay, type CrewSceneProps } from "../crew/CrewOverlay";
import { ZoneOverlay } from "../zones/ZoneOverlay";
import { LiveMissionOverlay, type LiveMarker, type LiveExposure } from "../mission/LiveMissionOverlay";
import type { ZoneCell, ZoneGrid } from "../zones/zone-types";
import type { FocusCommand } from "./detail-surface";
import type { ColorStop } from "./terrain-style";
import type { TerrainDisplay } from "./terrain-display";
import type { ScalarLayers } from "./TerrainMesh";
import type {
  MissionData,
  HeightGrid,
  RouteSummary,
  RouteNode,
  LocalPoint,
} from "../mission/types";
import { TerrainMesh } from "./TerrainMesh";
import { TerrainFallback } from "./TerrainFallback";
import { RouteOverlay } from "./RouteOverlay";
import type { LayerSettings } from "../layers/layer-state";
class SceneBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      this.props.fallback
    ) : (
      this.props.children
    );
  }
}

function ContextLoss({ onLost }: { onLost: () => void }) {
  const canvas = useThree((state) => state.gl.domElement);
  useEffect(() => {
    canvas.addEventListener("webglcontextlost", onLost);
    return () => canvas.removeEventListener("webglcontextlost", onLost);
  }, [canvas, onLost]);
  return null;
}

export function TerrainCanvas({
  mission,
  grid,
  display,
  scalars,
  optical,
  colorStops,
  view,
  token,
  layers,
  summary,
  nodes,
  onPick,
  onSelect,
  focusedSample,
  detail = null,
  focus = null,
  onNavigate,
  onManual,
  crew,
  followPoint,
  getFollowPoint,
  selectionFocus,
  hazards = [],
  selectedHazardId = null,
  onHazardSelect,
  zones,
  onZoneSelect,
  liveMarkers = [],
  liveRadiusM = 50,
  liveExposure,
  onLiveSelect,
  showRouteNodes = true,
  includePresetStops = true,
  children,
  fallback,
}: {
  children?: ReactNode;
  fallback?: ReactNode;
  liveMarkers?: LiveMarker[];
  liveRadiusM?: number;
  liveExposure?: LiveExposure;
  onLiveSelect?: (marker: LiveMarker) => void;
  showRouteNodes?: boolean;
  includePresetStops?: boolean;
  zones?: ZoneGrid;
  onZoneSelect?: (cell: ZoneCell) => void;
  hazards?: Hazard[];
  selectedHazardId?: string | null;
  onHazardSelect?: (id: string) => void;
  crew?: CrewSceneProps;
  followPoint?: LocalPoint | null;
  getFollowPoint?: () => LocalPoint | null;
  selectionFocus?: { point: LocalPoint; token: number } | null;
  detail?: HeightGrid | null;
  focus?: FocusCommand | null;
  onNavigate: (target: LocalPoint, span: number) => void;
  onManual: () => void;
  mission: MissionData;
  grid: HeightGrid;
  display: TerrainDisplay;
  scalars: ScalarLayers;
  optical: HTMLImageElement | null;
  colorStops: ColorStop[];
  view: "orbit" | "top";
  token: number;
  layers: LayerSettings;
  summary?: RouteSummary;
  nodes?: RouteNode[];
  onPick?: (p: LocalPoint) => void;
  onSelect?: (n: RouteNode) => void;
  focusedSample?: number | null;
}) {
  const markerPortal = useRef<HTMLDivElement>(null);
  const [contextLost, setContextLost] = useState(false);
  const showFallback = useCallback(() => setContextLost(true), []);
  const unavailable = fallback ?? <TerrainFallback reason="The 3D view is unavailable. Use the local image and source notes." />;
  if (contextLost) return unavailable;
  return (
    <SceneBoundary fallback={unavailable}>
      <div className="scanner-marker-portal" ref={markerPortal} />
      <Canvas
        frameloop="demand"
        dpr={[1, 1.5]}
        camera={{ position: [1700, 1550, 1900], fov: 43, near: 1, far: 15000 }}
        fallback={<p>This browser cannot display the 3D canvas.</p>}
      >
        <ContextLoss onLost={showFallback} />
        <Suspense fallback={null}>
          <TerrainMesh
            mission={mission}
            grid={grid}
            hole={detail}
            layers={layers}
            display={display}
            scalars={scalars}
            opticalImage={optical}
            colorStops={colorStops}
            onPick={onPick}
          />
          {detail && (
            <TerrainMesh
              mission={mission}
              grid={detail}
              frame={grid}
              tile
              layers={layers}
              display={display}
              scalars={scalars}
              opticalImage={optical}
              colorStops={colorStops}
              onPick={onPick}
            />
          )}
          {hazards.length > 0 && (
            <HazardOverlay
              hazards={hazards}
              selectedId={selectedHazardId}
              onSelect={onHazardSelect}
              grid={grid}
              detail={detail}
              datum={mission.manifest.elevationRangeM[0]}
              scale={display.scale}
              portal={markerPortal}
            />
          )}
          {zones && onZoneSelect && (
            <ZoneOverlay
              zones={zones}
              onSelect={onZoneSelect}
              grid={grid}
              detail={detail}
              datum={mission.manifest.elevationRangeM[0]}
              scale={display.scale}
              portal={markerPortal}
            />
          )}
          {liveMarkers.length > 0 && onLiveSelect && (
            <LiveMissionOverlay exposure={liveExposure} markers={liveMarkers} radiusM={liveRadiusM} onSelect={onLiveSelect} grid={grid} detail={detail} datum={mission.manifest.elevationRangeM[0]} scale={display.scale} portal={markerPortal} />
          )}
          {crew && (
            <CrewOverlay
              {...crew}
              grid={grid}
              detail={detail}
              datum={mission.manifest.elevationRangeM[0]}
              scale={display.scale}
              portal={markerPortal}
            />
          )}
          {summary && nodes && (
            <RouteOverlay
              portal={markerPortal}
              grid={grid}
              detail={detail}
              datum={mission.manifest.elevationRangeM[0]}
              scale={display.scale}
              summary={summary}
              nodes={[
                ...nodes,
                ...(includePresetStops ? mission.presetNodes.filter(
                  (n) =>
                    n.kind === "stop" &&
                    !nodes.some((active) => active.stopId === n.stopId),
                ) : []),
              ]}
              showNodes={showRouteNodes}
              onSelect={onSelect}
              focusedSample={focusedSample}
            />
          )}
          {children}
        </Suspense>
        <ambientLight intensity={1.6} />
        <directionalLight position={[-400, 1000, 400]} intensity={2.2} />
        <CameraController
          detail={detail}
          datum={mission.manifest.elevationRangeM[0]}
          scale={display.scale}
          followPoint={followPoint}
          getFollowPoint={getFollowPoint}
          selectionFocus={selectionFocus}
          view={view}
          token={token}
          span={(grid.width - 1) * grid.cellSizeM}
          grid={grid}
          focus={focus}
          onNavigate={onNavigate}
          onManual={onManual}
        />
      </Canvas>
    </SceneBoundary>
  );
}
