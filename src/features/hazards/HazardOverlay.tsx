import { useMemo, useEffect, type CSSProperties, type RefObject } from "react";
import { BufferGeometry, Color, Float32BufferAttribute } from "three";
import { Html } from "@react-three/drei";
import { AlertTriangle } from "lucide-react";
import type { HeightGrid } from "../mission/types";
import type { ReliefScale } from "../terrain/terrain-display";
import { sampleDisplayedPosition } from "../terrain/detail-surface";
import { hazardPolygons, pointInHazard } from "./hazard-geometry";
import type { Hazard } from "./hazard-types";
import { scenarioHazardColors } from "./scenario-hazard-colors";
export function HazardOverlay({
  hazards,
  selectedId,
  onSelect,
  grid,
  detail,
  datum,
  scale,
  portal,
}: {
  hazards: Hazard[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  grid: HeightGrid;
  detail: HeightGrid | null;
  datum: number;
  scale: ReliefScale;
  portal: RefObject<HTMLDivElement | null>;
}) {
  const markedSlopes = new Set(
    hazards
      .filter((h) => h.category === "slope")
      .slice(0, 2)
      .map((h) => h.id),
  );
  return (
    <group>
      {hazards.map((hazard) => (
        <Zone
          key={hazard.id}
          hazard={hazard}
          selected={hazard.id === selectedId}
          showMarker={
            hazard.category !== "slope" || markedSlopes.has(hazard.id)
          }
          onSelect={() => onSelect(hazard.id)}
          grid={grid}
          detail={detail}
          datum={datum}
          scale={scale}
          portal={portal}
        />
      ))}
    </group>
  );
}
function Zone({
  hazard,
  selected,
  showMarker,
  onSelect,
  grid,
  detail,
  datum,
  scale,
  portal,
}: {
  hazard: Hazard;
  selected: boolean;
  showMarker: boolean;
  onSelect: () => void;
  grid: HeightGrid;
  detail: HeightGrid | null;
  datum: number;
  scale: ReliefScale;
  portal: RefObject<HTMLDivElement | null>;
}) {
  const geometry = useMemo(() => {
    const positions: number[] = [];
    for (const polygon of hazardPolygons(hazard)) {
      const west = Math.min(...polygon.map((p) => p.x)),
        east = Math.max(...polygon.map((p) => p.x)),
        south = Math.min(...polygon.map((p) => p.y)),
        north = Math.max(...polygon.map((p) => p.y));
      const step = hazard.category === "dust" ? 64 : 8;
      for (let y = south; y < north; y += step)
        for (let x = west; x < east; x += step) {
          const ex = Math.min(east, x + step),
            ny = Math.min(north, y + step);
          if (
            hazard.geometry.kind !== "cells" &&
            !pointInHazard({ x: (x + ex) / 2, y: (y + ny) / 2 }, hazard)
          )
            continue;
          const points = [
            { x, y },
            { x: ex, y },
            { x: ex, y: ny },
            { x, y: ny },
          ].map((p) =>
            sampleDisplayedPosition(p, grid, detail, datum, scale, 2),
          );
          if (points.some((p) => p === null)) continue;
          for (const i of [0, 1, 2, 0, 2, 3]) positions.push(...points[i]!);
        }
    }
    const result = new BufferGeometry();
    result.setAttribute("position", new Float32BufferAttribute(positions, 3));
    return result;
  }, [hazard, grid, detail, datum, scale]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  const marker = sampleDisplayedPosition(
    hazard.marker,
    grid,
    detail,
    datum,
    scale,
    18,
  );
  return (
    <group>
      <mesh geometry={geometry} renderOrder={3} raycast={() => {}}>
        <shaderMaterial
          transparent
          depthWrite={false}
          side={2}
          uniforms={{
            intensity: { value: selected ? 0.32 : 0.12 },
            zoneColor: { value: new Color(hazard.scenarioKind ? scenarioHazardColors[hazard.scenarioKind] : "#f53629") },
          }}
          vertexShader={`varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`}
          fragmentShader={`varying vec3 p;uniform float intensity;uniform vec3 zoneColor;void main(){float stripe=step(.68,fract((p.x+p.z)/18.));gl_FragColor=vec4(zoneColor,intensity+stripe*.13);}`}
        />
      </mesh>
      {marker && showMarker && (
        <Html
          style={{ pointerEvents: "auto" }}
          portal={portal as RefObject<HTMLElement>}
          position={marker}
          center
        >
          <button
            className={`hazard-marker${hazard.scenarioKind ? ` hazard-marker--${hazard.scenarioKind}` : ""} ${selected ? "selected" : ""}`}
            data-scenario-kind={hazard.scenarioKind}
            style={hazard.scenarioKind ? { "--hazard-color": scenarioHazardColors[hazard.scenarioKind] } as CSSProperties : undefined}
            aria-label={`Inspect hazard ${hazard.id} ${hazard.title}`}
            onClick={onSelect}
          >
            <AlertTriangle size={15} />
            <span>{hazard.category === "slope" ? "SLOPE" : hazard.id}</span>
          </button>
        </Html>
      )}
    </group>
  );
}
