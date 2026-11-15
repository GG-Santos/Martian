"use client";

import { useEffect, useMemo, useRef, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { BufferGeometry, CanvasTexture, Float32BufferAttribute, SRGBColorSpace, type Mesh, type Vector2 } from "three";
import { referenceEyePaths, referenceMouthPaths } from "./face-texture-paths";
import { avatarFeatures } from "./avatar-expression";
import type { AvatarConfig } from "./avatar-types";

function FaceLayer({ paths, cap, gaze, blink, eyes, size, centerY }: {
  paths: readonly string[];
  cap: (x: number, y: number) => number;
  gaze: RefObject<Vector2>;
  blink: RefObject<number>;
  eyes: boolean;
  size: number;
  centerY: number;
}) {
  const mesh = useRef<Mesh>(null);
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1024;
    const context = canvas.getContext("2d");
    if (context) {
      context.scale(10.24, 10.24);
      context.fillStyle = "#f2f8f8";
      paths.forEach(path => context.fill(new Path2D(path)));
    }
    const result = new CanvasTexture(canvas);
    result.colorSpace = SRGBColorSpace;
    return result;
  }, [paths]);
  const grid = useMemo(() => {
    const positions: number[] = [], uv: number[] = [], indices: number[] = [];
    const segments = 32;
    for (let row = 0; row <= segments; row++) for (let col = 0; col <= segments; col++) {
      const u = col / segments, v = row / segments;
      positions.push((u - 0.5) * size, centerY + (v - 0.5) * size, 0);
      uv.push(u, v);
      if (row < segments && col < segments) {
        const a = row * (segments + 1) + col, b = a + segments + 1;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uv, 2));
    geometry.setIndex(indices);
    return { geometry, base: new Float32Array(positions), eyeY: centerY + size * 0.2 };
  }, [size, centerY]);
  useEffect(() => () => { texture.dispose(); }, [texture]);
  useEffect(() => () => { grid.geometry.dispose(); }, [grid]);
  useFrame(() => {
    const positions = mesh.current?.geometry.attributes.position;
    if (!positions) return;
    for (let i = 0; i < positions.count; i++) {
      const x = grid.base[i * 3] + gaze.current.x * 0.021;
      const originalY = grid.base[i * 3 + 1];
      const y = (eyes ? grid.eyeY + (originalY - grid.eyeY) * blink.current : originalY) + gaze.current.y * 0.015;
      positions.setXYZ(i, x, y, cap(x, y) + 0.0025);
    }
    positions.needsUpdate = true;
  });
  return <mesh ref={mesh} geometry={grid.geometry} frustumCulled={false}>
    <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
  </mesh>;
}

export function AvatarFace({ avatar, cap, gaze, blink }: {
  avatar: AvatarConfig;
  cap: (x: number, y: number) => number;
  gaze: RefObject<Vector2>;
  blink: RefObject<number>;
}) {
  const features = avatarFeatures(avatar);
  const eyes = referenceEyePaths[features.eyes as keyof typeof referenceEyePaths] ?? referenceEyePaths.round;
  const mouth = referenceMouthPaths[features.mouth as keyof typeof referenceMouthPaths] ?? referenceMouthPaths.smile;
  const layout = avatar.body === "tall" ? { size: 0.62, centerY: 0.16 } : avatar.body === "scout" ? { size: 0.68, centerY: 0.105 } : (avatar.body === "prism" || avatar.body === "cube") ? { size: 0.84, centerY: 0.08 } : { size: 0.77, centerY: 0.08 };
  const mouthPaths = useMemo(() => [mouth], [mouth]);
  return <>
    <FaceLayer paths={eyes} cap={cap} gaze={gaze} blink={blink} {...layout} eyes />
    <FaceLayer paths={mouthPaths} cap={cap} gaze={gaze} blink={blink} {...layout} eyes={false} />
  </>;
}
