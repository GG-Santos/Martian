"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Home,
  Flag,
  Bot,
  UserRound,
  Mountain,
  Wind,
  FlaskConical,
  Radiation,
  Flame,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  CircleDot,
  Waves,
} from "lucide-react";
import type { MissionData, LocalPoint } from "./types";
import type { RoomSnapshot } from "../session/protocol";
import type { CrewRouteOption } from "../route/crew-route";
import type { Hazard } from "../hazards/hazard-types";
import { hazardPolygons } from "../hazards/hazard-geometry";
import type { ScienceCategory } from "../science/science-atlas";
import { scenarioHazardColors } from "../hazards/scenario-hazard-colors";
import { sampleSlopeDeg } from "../terrain/spatial";

export type SurfaceLayer = ScienceCategory | "slope";
const shellColors = {
  chalk: "#e7e4d9",
  mint: "#8fc9b9",
  coral: "#d79c86",
  violet: "#a8a0d2",
  copper: "#bb795c",
  sky: "#80b9d7",
  moss: "#a5b678",
  slate: "#778da3",
  amber: "#e2ac51",
  ruby: "#c85f70",
  teal: "#47b5a8",
  indigo: "#666fba",
};
const hazardIcons = {
  heat: Flame,
  dust: Wind,
  chemical: FlaskConical,
  radiation: Radiation,
  rockfall: Mountain,
  storm: Wind,
};

export function MarswalkMap({
  mission,
  room,
  layer,
  thermal,
  route,
  hazards,
  crewPoint,
  onPick,
  showHazards,
  opacity,
}: {
  mission: MissionData;
  room: RoomSnapshot;
  layer: SurfaceLayer;
  thermal: Uint8Array | null;
  route?: CrewRouteOption;
  hazards: Hazard[];
  crewPoint?: LocalPoint;
  onPick?: (point: LocalPoint) => void;
  showHazards: boolean;
  opacity: number;
}) {
  const rasterImage = useRef<SVGImageElement>(null);
  const rasterCache = useRef(new Map<string, string>());
  const mapElement = useRef<HTMLDivElement>(null);
  const [screenSize, setScreenSize] = useState(500);
  const [viewport, setViewport] = useState({ x: -180, y: -180, size: 2408 });
  const drag = useRef<{
    x: number;
    y: number;
    startX: number;
    startY: number;
    moved: boolean;
  } | null>(null);
  const bounds = mission.manifest.bounds;
  const project = (point: LocalPoint) =>
    `${point.x},${bounds.northM - point.y}`;
  const elevationRange = mission.manifest.elevationRangeM;
  useEffect(() => {
    const element = mapElement.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0].contentRect;
      setScreenSize(Math.min(rect.width, rect.height));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!["thermal", "topographic", "slope"].includes(layer)) return;
    const cached = rasterCache.current.get(layer);
    if (cached) {
      rasterImage.current?.setAttribute("href", cached);
      return;
    }
    const canvas = document.createElement("canvas");
    const grid = mission.grid;
    canvas.width = grid.width;
    canvas.height = grid.height;
    const context = canvas.getContext("2d");
    if (!context) return;
    const pixels = context.createImageData(grid.width, grid.height);
    const palette =
      layer === "thermal"
        ? [
            [42, 21, 72],
            [211, 73, 90],
            [255, 224, 143],
          ]
        : layer === "slope"
          ? [
              [72, 112, 107],
              [210, 169, 94],
              [190, 73, 53],
            ]
          : [
              [59, 78, 93],
              [126, 151, 141],
              [225, 202, 157],
            ];
    for (let i = 0; i < grid.values.length; i++) {
      const value =
        layer === "thermal"
          ? thermal?.[i]
          : layer === "slope"
            ? sampleSlopeDeg(grid, {
                x: grid.westM + (i % grid.width) * grid.cellSizeM,
                y: grid.northM - Math.floor(i / grid.width) * grid.cellSizeM,
              })
            : grid.values[i];
      const range =
        layer === "thermal"
          ? mission.manifest.thermalDnRange
          : layer === "slope"
            ? [0, 30]
            : elevationRange;
      if (
        value == null ||
        !Number.isFinite(value) ||
        (layer === "thermal" && value === 0)
      )
        continue;
      const t =
        Math.max(0, Math.min(1, (value - range[0]) / (range[1] - range[0]))) *
        2;
      const lower = Math.min(1, Math.floor(t)),
        fraction = t - lower;
      for (let c = 0; c < 3; c++)
        pixels.data[i * 4 + c] =
          palette[lower][c] +
          (palette[lower + 1][c] - palette[lower][c]) * fraction;
      pixels.data[i * 4 + 3] = 215;
    }
    context.putImageData(pixels, 0, 0);
    const url = canvas.toDataURL();
    rasterCache.current.set(layer, url);
    rasterImage.current?.setAttribute("href", url);
  }, [layer, mission, thermal, elevationRange]);
  const routePath = useMemo(
    () =>
      route?.nodes
        .map(
          (n, i) =>
            `${i ? "L" : "M"}${n.point.x},${mission.manifest.bounds.northM - n.point.y}`,
        )
        .join(" ") ?? "",
    [route, mission],
  );
  const markerScale = (viewport.size / Math.max(1, screenSize)) * 0.6;
  const zoom = (factor: number) =>
    setViewport((v) => {
      const size = Math.max(180, Math.min(3200, v.size * factor));
      return {
        x: v.x + (v.size - size) / 2,
        y: v.y + (v.size - size) / 2,
        size,
      };
    });
  return (
    <div ref={mapElement} className={`marswalk-map layer-${layer}`}>
      <svg
        viewBox={`${viewport.x} ${viewport.y} ${viewport.size} ${viewport.size}`}
        aria-label="Interactive Jezero surface map"
        role="group"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "+" || e.key === "=") zoom(0.8);
          if (e.key === "-") zoom(1.25);
        }}
        onPointerDown={(e) => {
          if ((e.target as Element).closest(".walk-map-marker")) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          drag.current = {
            x: e.clientX,
            y: e.clientY,
            startX: viewport.x,
            startY: viewport.y,
            moved: false,
          };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const scale = viewport.size / Math.min(rect.width, rect.height);
          if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) d.moved = true;
          if (d.moved)
            setViewport((v) => ({
              ...v,
              x: d.startX - (e.clientX - d.x) * scale,
              y: d.startY - (e.clientY - d.y) * scale,
            }));
        }}
        onPointerUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.moved || !onPick) return;
          const matrix = e.currentTarget.getScreenCTM();
          if (!matrix) return;
          const point = new DOMPoint(e.clientX, e.clientY).matrixTransform(
            matrix.inverse(),
          );
          if (
            point.x >= 0 &&
            point.x <= bounds.eastM &&
            point.y >= 0 &&
            point.y <= bounds.northM
          )
            onPick({
              x: Math.round(point.x),
              y: Math.round(bounds.northM - point.y),
            });
        }}
      >
        <image
          href="/data/jezero/optical.webp"
          x={0}
          y={0}
          width={2048}
          height={2048}
          className="walk-optical"
        />
        {["thermal", "topographic", "slope"].includes(layer) && (
          <image
            key={layer}
            ref={rasterImage}
            x={0}
            y={0}
            width={2048}
            height={2048}
            opacity={opacity}
          />
        )}
        {showHazards &&
          hazards.map((hazard) => (
            <g
              key={hazard.id}
              className="walk-hazard"
              style={{
                color: hazard.scenarioKind
                  ? scenarioHazardColors[hazard.scenarioKind]
                  : "#d59a79",
              }}
            >
              {hazardPolygons(hazard).map((polygon, i) => (
                <polygon
                  key={i}
                  points={polygon.map(project).join(" ")}
                  fill="currentColor"
                  fillOpacity={0.12}
                  stroke="currentColor"
                  strokeWidth={1}
                  strokeDasharray="6 7"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </g>
          ))}
        {routePath && (
          <>
            <path
              d={routePath}
              stroke="#182323"
              strokeWidth={8}
              vectorEffect="non-scaling-stroke"
              fill="none"
            />
            <path
              d={routePath}
              stroke="#c3e0cf"
              strokeWidth={3}
              vectorEffect="non-scaling-stroke"
              fill="none"
              strokeLinejoin="round"
            />
          </>
        )}
        {showHazards &&
          hazards
            .filter((h) => h.category !== "slope")
            .map((h) => {
              const Icon = h.scenarioKind
                ? hazardIcons[h.scenarioKind]
                : h.category === "dust"
                  ? Wind
                  : h.category === "rockfall"
                    ? Mountain
                    : h.category === "sand"
                      ? Waves
                      : CircleDot;
              return (
                <g
                  key={h.id}
                  className="walk-map-marker"
                  transform={`translate(${project(h.marker)}) scale(${markerScale})`}
                  tabIndex={0}
                  aria-label={h.title}
                >
                  <title>
                    {h.title} · {h.evidence}
                  </title>
                  <circle r={23} fill="#151b20" />
                  <Icon
                    x={-13}
                    y={-13}
                    width={26}
                    height={26}
                    color={
                      h.scenarioKind
                        ? scenarioHazardColors[h.scenarioKind]
                        : "#e1b99a"
                    }
                  />
                </g>
              );
            })}
        {room.base && (
          <g
            className="walk-map-marker"
            transform={`translate(${project(room.base)}) scale(${markerScale})`}
          >
            <title>Crew habitat · departure and return</title>
            <circle r={29} fill="#e2e8e2" />
            <Home x={-17} y={-17} width={34} height={34} color="#152020" />
          </g>
        )}
        {[
          room.mission,
          ...room.quests.filter(
            (q) =>
              route?.objectiveIds.includes(q.id) && q.id !== room.mission?.id,
          ),
        ]
          .filter((q) => !!q)
          .map((q) => (
            <g
              key={q!.id}
              className="walk-map-marker"
              transform={`translate(${project(q!.point)}) scale(${markerScale})`}
              tabIndex={0}
              aria-label={q!.title}
            >
              <title>{q!.title}</title>
              <circle r={25} fill="#21292b" stroke="#ddc498" strokeWidth={3} />
              <Flag x={-13} y={-13} width={26} height={26} color="#ddc498" />
            </g>
          ))}
        {crewPoint &&
          room.members.map((member, i) => {
            const Icon = member.isBot ? Bot : UserRound;
            return (
              <g
                key={member.id}
                className="walk-map-marker walk-astronaut"
                transform={`translate(${project({ x: crewPoint.x + i * 44 * markerScale, y: crewPoint.y + 68 * markerScale })}) scale(${markerScale})`}
                tabIndex={0}
                aria-label={member.name}
              >
                <title>
                  {member.name} · {member.role}
                  {member.isBot ? " · crew bot" : ""}
                </title>
                <circle
                  r={19}
                  fill={shellColors[member.avatar.shell]}
                  stroke="#101b20"
                  strokeWidth={3}
                />
                <Icon x={-12} y={-12} width={24} height={24} color="#132129" />
              </g>
            );
          })}
      </svg>
      <div className="walk-map-heading">
        <span>Jezero crater</span>
        <small>
          {mission.manifest.center.latitude.toFixed(3)}° N ·{" "}
          {mission.manifest.center.longitude.toFixed(3)}° E
        </small>
      </div>
      <span className="walk-north">N ↑</span>
      <div className="walk-map-tools">
        <button aria-label="Zoom in" onClick={() => zoom(0.8)}>
          <ZoomIn size={17} />
        </button>
        <button aria-label="Zoom out" onClick={() => zoom(1.25)}>
          <ZoomOut size={17} />
        </button>
        <button
          aria-label="Reset map"
          onClick={() => setViewport({ x: -180, y: -180, size: 2408 })}
        >
          <RotateCcw size={16} />
        </button>
      </div>
      <div className="walk-map-scale">
        <span style={{ width: `${(500 * screenSize) / viewport.size}px` }} />
        500 m
      </div>
      <small className="walk-map-credit">
        NASA/JPL-Caltech/UArizona/USGS · archival observations
      </small>
    </div>
  );
}
