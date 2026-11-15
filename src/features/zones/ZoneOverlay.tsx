import { Html } from "@react-three/drei";
import { useEffect, useMemo, type RefObject } from "react";
import { BufferGeometry, Float32BufferAttribute } from "three";
import type { HeightGrid } from "../mission/types";
import type { ReliefScale } from "../terrain/terrain-display";
import { sampleDisplayedPosition } from "../terrain/detail-surface";
import type { ZoneCategory, ZoneCell, ZoneGrid } from "./zone-types";

const visualStep = 4;
const priority: Record<ZoneCategory, number> = {
  safe: 0,
  unknown: 1,
  caution: 2,
  hazard: 3,
};

export function ZoneOverlay({
  zones,
  grid,
  detail,
  datum,
  scale,
  portal,
  onSelect,
}: {
  zones: ZoneGrid;
  grid: HeightGrid;
  detail: HeightGrid | null;
  datum: number;
  scale: ReliefScale;
  portal: RefObject<HTMLDivElement | null>;
  onSelect: (cell: ZoneCell) => void;
}) {
  const { geometry, markers } = useMemo(() => {
    const positions: number[] = [];
    const markerMap = new Map<ZoneCategory, ZoneCell>();
    for (let row = 0; row < zones.height; row += visualStep) {
      for (let col = 0; col < zones.width; col += visualStep) {
        const endRow = Math.min(zones.height, row + visualStep);
        const endCol = Math.min(zones.width, col + visualStep);
        let dominant: ZoneCell | null = null;
        for (let r = row; r < endRow; r++) {
          for (let c = col; c < endCol; c++) {
            const cell = zones.cells[r * zones.width + c];
            if (!dominant || priority[cell.category] > priority[dominant.category])
              dominant = cell;
          }
        }
        if (!dominant) continue;
        if (!markerMap.has(dominant.category)) markerMap.set(dominant.category, dominant);
        if (dominant.category === "safe") continue;
        const west = zones.westM + col * zones.cellSizeM;
        const east = zones.westM + endCol * zones.cellSizeM;
        const north = zones.northM - row * zones.cellSizeM;
        const south = zones.northM - endRow * zones.cellSizeM;
        const corners = [
          { x: west, y: north },
          { x: east, y: north },
          { x: east, y: south },
          { x: west, y: south },
        ].map((point) => sampleDisplayedPosition(point, grid, detail, datum, scale, 3));
        if (corners.some((corner) => !corner)) continue;
        for (const index of [0, 1, 2, 0, 2, 3]) positions.push(...corners[index]!);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    const markers = [...markerMap.values()];
    return { geometry, markers };
  }, [zones, grid, detail, datum, scale]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <group>
      <mesh geometry={geometry} renderOrder={2} raycast={() => {}}>
        <meshBasicMaterial color="#e4d6be" opacity={0.065} transparent depthWrite={false} side={2} />
      </mesh>
      {markers.map((cell) => {
        const position = sampleDisplayedPosition(cell.center, grid, detail, datum, scale, 16);
        return position ? (
          <Html key={cell.category} style={{ pointerEvents: "auto" }} portal={portal as RefObject<HTMLElement>} position={position} center>
            <button className={`zone-marker ${cell.category}`} aria-label={`Inspect zone ${cell.category} ${cell.label}`} onClick={() => onSelect(cell)}>
              {cell.category === "safe" ? "LOWER SLOPE" : cell.category.toUpperCase()}
            </button>
          </Html>
        ) : null;
      })}
    </group>
  );
}
