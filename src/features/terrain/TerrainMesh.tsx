"use client";
import { useEffect, useMemo } from "react";
import {
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Texture,
  SRGBColorSpace,
} from "three";
import type { HeightGrid, MissionData, LocalPoint } from "../mission/types";
import type { LayerSettings } from "../layers/layer-state";
import type { ColorStop } from "./terrain-style";
import type { TerrainDisplay } from "./terrain-display";
import { contains } from "./detail-surface";
import { fromScene } from "./spatial";
import {
  createScalarTexture,
  terrainFragment,
  terrainUniforms,
  terrainVertex,
} from "./terrain-material";

function createGeometry(
  grid: HeightGrid,
  datum: number,
  scale: number,
  stride: number,
  frame = grid,
  hole: HeightGrid | null = null,
) {
  const columns = Math.ceil((grid.width - 1) / stride) + 1;
  const rows = Math.ceil((grid.height - 1) / stride) + 1;
  const positions = new Float32Array(columns * rows * 3);
  const uv = new Float32Array(columns * rows * 2);
  const index = new Uint32Array((columns - 1) * (rows - 1) * 6);
  let cursor = 0;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const r = Math.min(row * stride, grid.height - 1),
        c = Math.min(col * stride, grid.width - 1);
      const i = row * columns + col;
      const height = grid.values[r * grid.width + c];
      positions.set(
        [
          grid.westM +
            c * grid.cellSizeM -
            frame.westM -
            ((frame.width - 1) * frame.cellSizeM) / 2,
          Number.isFinite(height) ? (height - datum) * scale : 0,
          frame.northM -
            grid.northM +
            r * grid.cellSizeM -
            ((frame.height - 1) * frame.cellSizeM) / 2,
        ],
        i * 3,
      );
      uv.set(
        [
          (grid.westM + c * grid.cellSizeM - frame.westM) /
            ((frame.width - 1) * frame.cellSizeM),
          1 -
            (frame.northM - grid.northM + r * grid.cellSizeM) /
              ((frame.height - 1) * frame.cellSizeM),
        ],
        i * 2,
      );
      if (row === rows - 1 || col === columns - 1) continue;
      const nextR = Math.min(r + stride, grid.height - 1),
        nextC = Math.min(c + stride, grid.width - 1);
      if (
        ![
          height,
          grid.values[r * grid.width + nextC],
          grid.values[nextR * grid.width + c],
          grid.values[nextR * grid.width + nextC],
        ].every(Number.isFinite)
      )
        continue;
      if (
        hole &&
        contains(hole, {
          x: grid.westM + (c + stride / 2) * grid.cellSizeM,
          y: grid.northM - (r + stride / 2) * grid.cellSizeM,
        })
      )
        continue;
      index.set(
        [i, i + columns, i + 1, i + 1, i + columns, i + columns + 1],
        cursor,
      );
      cursor += 6;
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
  geometry.setIndex(new BufferAttribute(index.subarray(0, cursor), 1));
  geometry.computeVertexNormals();
  return geometry;
}

function createWire(
  grid: HeightGrid,
  surface: BufferGeometry,
  hole: HeightGrid | null,
) {
  const stride = Math.max(1, Math.round(32 / grid.cellSizeM));
  const indices: number[] = [];
  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      const i = row * grid.width + col;
      if (
        hole &&
        contains(hole, {
          x: grid.westM + col * grid.cellSizeM,
          y: grid.northM - row * grid.cellSizeM,
        })
      )
        continue;
      if (!Number.isFinite(grid.values[i])) continue;
      if (
        (row % stride === 0 || row === grid.height - 1) &&
        col + 1 < grid.width &&
        Number.isFinite(grid.values[i + 1])
      )
        indices.push(i, i + 1);
      if (
        (col % stride === 0 || col === grid.width - 1) &&
        row + 1 < grid.height &&
        Number.isFinite(grid.values[i + grid.width])
      )
        indices.push(i, i + grid.width);
    }
  }
  const wire = new BufferGeometry();
  wire.setAttribute("position", surface.getAttribute("position").clone());
  wire.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  return wire;
}

export type ScalarLayers = Partial<
  Record<"slope" | "thermal", Uint8Array | null>
>;

function createSkirt(grid: HeightGrid, datum: number, scale: number) {
  const edge: number[] = [];
  for (let col = 0; col < grid.width; col++) edge.push(col);
  for (let row = 1; row < grid.height; row++)
    edge.push(row * grid.width + grid.width - 1);
  for (let col = grid.width - 2; col >= 0; col--)
    edge.push((grid.height - 1) * grid.width + col);
  for (let row = grid.height - 2; row > 0; row--) edge.push(row * grid.width);
  const corners = edge.map((i) => [
    ((i % grid.width) - (grid.width - 1) / 2) * grid.cellSizeM,
    (grid.values[i] - datum) * scale,
    (Math.floor(i / grid.width) - (grid.height - 1) / 2) * grid.cellSizeM,
  ]);
  const bottom =
    corners.reduce(
      (min, [, y]) => (Number.isFinite(y) ? Math.min(min, y) : min),
      0,
    ) - 25;
  const positions: number[] = [];
  for (let i = 0; i < corners.length; i++) {
    const a = corners[i],
      b = corners[(i + 1) % corners.length];
    if (!Number.isFinite(a[1]) || !Number.isFinite(b[1])) continue;
    const lowerA = [a[0], bottom, a[2]],
      lowerB = [b[0], bottom, b[2]];
    positions.push(...a, ...lowerA, ...b, ...b, ...lowerA, ...lowerB);
  }
  const skirt = new BufferGeometry();
  skirt.setAttribute(
    "position",
    new BufferAttribute(new Float32Array(positions), 3),
  );
  return skirt;
}

export function TerrainMesh({
  mission,
  grid,
  onPick,
  layers,
  display,
  scalars,
  opticalImage,
  colorStops,
  frame = grid,
  hole = null,
  tile = false,
}: {
  frame?: HeightGrid;
  hole?: HeightGrid | null;
  tile?: boolean;
  mission: MissionData;
  grid: HeightGrid;
  onPick?: (p: LocalPoint) => void;
  layers: LayerSettings;
  display: TerrainDisplay;
  scalars: ScalarLayers;
  opticalImage: HTMLImageElement | null;
  colorStops: ColorStop[];
}) {
  const optical = useMemo(() => {
    if (!opticalImage) return null;
    const texture = new Texture(opticalImage);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }, [opticalImage]);
  useEffect(() => () => optical?.dispose(), [optical]);
  const { manifest } = mission;
  const datum = manifest.elevationRangeM[0];
  const { scale, mode } = display;
  const solid = mode === "surface" || mode === "physical";
  const geometry = useMemo(
    () => createGeometry(grid, datum, scale, 1, frame, hole),
    [grid, datum, scale, frame, hole],
  );
  const skirt = useMemo(
    () => createSkirt(grid, datum, scale),
    [grid, datum, scale],
  );
  const inspectionGeometry = useMemo(() => {
    if (mode === "mesh") return createWire(grid, geometry, hole);
    if (mode === "points")
      return createGeometry(
        grid,
        datum,
        scale,
        Math.max(1, Math.round(16 / grid.cellSizeM)),
        frame,
        hole,
      );
    return null;
  }, [grid, geometry, datum, scale, mode, frame, hole]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => skirt.dispose(), [skirt]);
  useEffect(() => () => inspectionGeometry?.dispose(), [inspectionGeometry]);
  const selected = layers.analysis;
  const bytes =
    selected === "slope" || selected === "thermal" ? scalars[selected] : null;
  const scalar = useMemo(
    () =>
      bytes
        ? createScalarTexture(bytes, manifest.grid.width, manifest.grid.height)
        : createScalarTexture(new Uint8Array([0]), 1, 1),
    [bytes, manifest.grid],
  );
  useEffect(() => () => scalar.dispose(), [scalar]);
  const uniforms = terrainUniforms(
    optical,
    scalar,
    selected === "elevation" || bytes ? selected : "none",
    manifest,
    layers,
    display,
    colorStops,
  );

  return (
    <group>
      <mesh
        geometry={geometry}
        renderOrder={solid ? 0 : 2}
        onClick={
          onPick
            ? (event) => {
                if (event.delta >= 5) return;
                event.stopPropagation();
                onPick(fromScene(event.point.x, event.point.z, frame));
              }
            : undefined
        }
      >
        <shaderMaterial
          visible={solid || display.grid || display.contours}
          transparent={!solid}
          depthWrite={solid}
          side={DoubleSide}
          uniforms={uniforms}
          vertexShader={terrainVertex}
          fragmentShader={terrainFragment}
        />
      </mesh>
      {mode === "mesh" && inspectionGeometry && (
        <lineSegments geometry={inspectionGeometry}>
          <lineBasicMaterial color="#bec6d0" transparent opacity={0.66} />
        </lineSegments>
      )}
      {mode === "points" && inspectionGeometry && (
        <points geometry={inspectionGeometry}>
          <pointsMaterial color="#d9e0e7" size={2} sizeAttenuation={false} />
        </points>
      )}
      {solid && !tile && (
        <mesh geometry={skirt}>
          <meshBasicMaterial
            color={mode === "physical" ? "#392823" : "#2b3038"}
            side={DoubleSide}
          />
        </mesh>
      )}
    </group>
  );
}
