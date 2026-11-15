"use client";

import { Html, Line } from "@react-three/drei";
import { useMemo, type RefObject } from "react";
import type { HeightGrid, LocalPoint } from "./types";
import type { ReliefScale } from "../terrain/terrain-display";
import { sampleDisplayedPosition } from "../terrain/detail-surface";
import { AvatarMesh } from "../avatar/Avatar3D";
import type { AvatarConfig } from "../avatar/avatar-types";
import type { CrewRouteOption } from "../route/crew-route";

export type LiveMarker = { id: string; kind: "member" | "quest" | "base"; label: string; point: LocalPoint; active?: boolean; warning?: boolean; avatar?: AvatarConfig };

export type LiveExposure = { route: CrewRouteOption; legIndexes: number[] };

export function LiveMissionOverlay({ markers, radiusM, onSelect, grid, detail, datum, scale, portal, exposure }: {
  markers: LiveMarker[];
  radiusM: number;
  onSelect: (marker: LiveMarker) => void;
  grid: HeightGrid;
  detail: HeightGrid | null;
  datum: number;
  scale: ReliefScale;
  portal: RefObject<HTMLDivElement | null>;
  exposure?: LiveExposure;
}) {
  const exposedLines = useMemo(() => {
    if (!exposure?.legIndexes.length) return [];
    const { route, legIndexes } = exposure;
    const exposed = new Set(legIndexes);
    const lines: { index: number; points: [number, number, number][] }[] = [];
    let startDistance = 0;
    let sampleIndex = 0;
    for (let index = 0; index < route.nodes.length - 1; index++) {
      const start = route.nodes[index].point;
      const end = route.nodes[index + 1].point;
      const endDistance = startDistance + Math.hypot(end.x - start.x, end.y - start.y);
      if (exposed.has(index)) {
        const points: [number, number, number][] = [];
        for (let i = sampleIndex; i < route.summary.samples.length && route.summary.samples[i].distanceM <= endDistance; i++) {
          const p = sampleDisplayedPosition(route.summary.samples[i], grid, detail, datum, scale, 7);
          if (p) points.push(p);
        }
        if (points.length >= 2) lines.push({ index, points });
      }
      while (route.summary.samples[sampleIndex + 1]?.distanceM <= endDistance) sampleIndex++;
      startDistance = endDistance;
    }
    return lines;
  }, [exposure, grid, detail, datum, scale]);
  return <group>
    {exposedLines.map(({ index, points }) => (
      <Line key={index} points={points} color="#e4cb85" lineWidth={5} depthTest={false}
        depthWrite={false} transparent renderOrder={6} />
    ))}
    {markers.map((marker) => {
    const position = sampleDisplayedPosition(marker.point, grid, detail, datum, scale, marker.kind === "member" ? 28 : 18);
    const questNumber = marker.kind === "quest" ? markers.filter((item) => item.kind === "quest").findIndex((item) => item.id === marker.id) + 1 : 0;
    return position ? <group key={`${marker.kind}-${marker.id}`}>
      {marker.kind === "member" && <mesh position={[position[0], position[1] + 2, position[2]]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => {}}><ringGeometry args={[Math.max(1, radiusM - 0.6), radiusM, 64]} /><meshBasicMaterial color={marker.warning ? "#e6ad77" : "#91d6c6"} transparent opacity={0.28} depthWrite={false} depthTest={false} side={2} /></mesh>}
      {marker.kind === "member" && <group position={position} onClick={(event) => { event.stopPropagation(); onSelect(marker); }}><AvatarMesh avatar={marker.avatar} scale={18} /></group>}
      <Html portal={portal as RefObject<HTMLElement>} position={position} center style={{ pointerEvents: "auto" }}>
      <button type="button" className={`live-map-marker ${marker.kind}${marker.warning ? " warning" : ""}${marker.active ? " active" : ""}`} aria-label={`${marker.kind === "quest" ? "Inspect quest" : marker.kind === "member" ? "Locate astronaut" : "Locate base"} ${marker.label}`} title={marker.label} onClick={() => onSelect(marker)}>
        <span aria-hidden="true">{marker.kind === "member" ? "◉" : marker.kind === "quest" ? "◇" : "⌂"}</span> {marker.kind === "quest" ? `Q${questNumber}` : marker.label}
      </button>
    </Html></group> : null;
  })}</group>;
}
