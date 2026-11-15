import { useMemo, type RefObject } from "react";
import { Line, Html } from "@react-three/drei";
import { Color } from "three";
import type { HeightGrid, RouteSummary, RouteNode } from "../mission/types";
import { type ReliefScale } from "./terrain-display";
import { sampleDisplayedPosition } from "./detail-surface";
import { HabitatModel } from "../crew/HabitatModel";
import { objectives } from "../mission/expedition-objectives";
import { isCaution } from "../route/calculate-route";
export function RouteOverlay({
  portal,
  grid,
  detail = null,
  datum,
  scale,
  summary,
  nodes,
  onSelect,
  focusedSample,
  showNodes = true,
}: {
  portal: RefObject<HTMLDivElement | null>;
  grid: HeightGrid;
  detail?: HeightGrid | null;
  datum: number;
  scale: ReliefScale;
  summary: RouteSummary;
  nodes: RouteNode[];
  onSelect?: (n: RouteNode) => void;
  focusedSample?: number | null;
  showNodes?: boolean;
}) {
  const points = useMemo(
    () =>
      summary.samples.map(
        (s) =>
          sampleDisplayedPosition(s, grid, detail, datum, scale, 5) ??
          ([0, 0, 0] as [number, number, number]),
      ),
    [summary, grid, detail, datum, scale],
  );
  const colors = useMemo(
    () =>
      summary.samples.map(
        (s) => new Color(isCaution(s.slopeDeg) ? "#f2bb65" : "#a3eee0"),
      ),
    [summary],
  );
  const focused = focusedSample == null ? null : points[focusedSample];
  return (
    <group>
      <Line
        points={points}
        color="#112525"
        lineWidth={7}
        transparent
        depthTest={false}
        renderOrder={4}
      />
      <Line
        points={points}
        vertexColors={colors}
        lineWidth={3}
        transparent
        depthTest={false}
        renderOrder={5}
      />
      {showNodes && nodes
        .filter((n) => n.kind !== "end")
        .map((n, i) => {
          const p = sampleDisplayedPosition(
            n.point,
            grid,
            detail,
            datum,
            scale,
            8,
          );
          if (!p) return null;
          return (
            <group key={n.id} position={p}>
              <mesh
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(n);
                }}
              >
                {n.kind === "start" ? (
                  <boxGeometry args={[0.1, 0.1, 0.1]} />
                ) : n.kind === "stop" ? (
                  <octahedronGeometry args={[n.stopId === "A" ? 6 : 4.5]} />
                ) : (
                  <sphereGeometry args={[7, 12, 8]} />
                )}
                <meshBasicMaterial
                  color={n.kind === "start" ? "#f1c17b" : "#bdf5e8"}
                />
              </mesh>
              {n.kind === "start" && <HabitatModel />}
              <Html
                portal={portal as RefObject<HTMLElement>}
                center
                position={[0, 64, 0]}
                style={{ pointerEvents: "auto" }}
              >
                <button
                  className={`map-marker ${n.kind} ${n.stopId === "A" ? "main-objective" : ""}`}
                  title={objectives.find((o) => o.stopId === n.stopId)?.title}
                  onClick={() => onSelect?.(n)}
                  aria-label={
                    n.kind === "start"
                      ? "Hypothetical habitat"
                      : n.kind === "stop"
                        ? `Select science stop ${n.stopId}`
                        : `Select waypoint ${i}`
                  }
                >
                  {n.kind === "start"
                    ? "HAB"
                    : n.stopId === "A"
                      ? "◆ A"
                      : n.stopId
                        ? `◇ ${n.stopId}`
                        : "W"}
                </button>
              </Html>
            </group>
          );
        })}
      {focused && (
        <mesh position={focused}>
          <sphereGeometry args={[12, 12, 8]} />
          <meshBasicMaterial color="#fff5ce" />
        </mesh>
      )}
    </group>
  );
}
