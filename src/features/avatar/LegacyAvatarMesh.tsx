"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import { BufferGeometry, CanvasTexture, DoubleSide, Float32BufferAttribute, SRGBColorSpace, Vector2, type Group } from "three";
import { defaultAvatar, type AvatarConfig } from "./avatar-types";
import { sampleAvatarMotion } from "./avatar-motion";
import { avatarFeatures } from "./avatar-expression";
import { referenceEyePaths, referenceMouthPaths } from "./face-texture-paths";

const shellColors: Record<AvatarConfig["shell"], string> = {
  chalk: "#e7e4d9", mint: "#8fc9b9", coral: "#d79c86", violet: "#a8a0d2",
  copper: "#bb795c", sky: "#80b9d7", moss: "#a5b678", slate: "#778da3",
  amber: "#e2ac51", ruby: "#c85f70", teal: "#47b5a8", indigo: "#666fba",
};

type VisibleBody = Exclude<AvatarConfig["body"], "capsule">;
const proportions: Record<VisibleBody, [number, number, number]> = {
  orb: [0.84, 0.84, 0.84], tall: [0.67, 1.17, 0.66], wide: [1.08, 0.77, 0.69],
  scout: [0.7, 0.76, 0.66], pebble: [0.96, 0.74, 0.77],
  prism: [0.83, 0.92, 0.7], comet: [0.82, 1.04, 0.72], cube: [0.78, 0.79, 0.72],
};
const footFits: Record<VisibleBody, { attach: number; spread: number }> = {
  orb: { attach: 0.57, spread: 0.43 },
  tall: { attach: 0.78, spread: 0.34 },
  wide: { attach: 0.67, spread: 0.4 },
  scout: { attach: 0.67, spread: 0.4 },
  pebble: { attach: 0.65, spread: 0.4 },
  prism: { attach: 0.72, spread: 0.37 },
  comet: { attach: 0.75, spread: 0.36 },
  cube: { attach: 0.63, spread: 0.34 },
};
const latheProfiles = {
  tall: [[0, -1], [.62, -1], [.74, -.94], [.82, -.81], [.82, .81], [.74, .94], [.62, 1], [0, 1]],
  prism: [[0, -1], [.7, -1], [.89, -.85], [.81, .57], [.59, .92], [.42, 1], [0, 1]],
  comet: [[0, -1], [.63, -.98], [.82, -.85], [.94, -.45], [.84, .15], [.55, .7], [.2, .97], [0, 1]],
} as const;
const profilePoints = Object.fromEntries(Object.entries(latheProfiles).map(([key, profile]) => [key, profile.map(([x, y]) => new Vector2(x, y))])) as Record<keyof typeof latheProfiles, Vector2[]>;

function usePathTexture(paths: readonly string[], viewBox: string, dimensions: [number, number]) {
  const [texture, setTexture] = useState<CanvasTexture | null>(null);
  const pathsKey = paths.join("\u001f");
  const width = dimensions[0];
  const height = dimensions[1];
  useEffect(() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}"><g fill="#f2f8f8">${pathsKey.split("\u001f").map((path) => `<path d="${path}"/>`).join("")}</g></svg>`;
    const image = new Image();
    const objectUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    let cancelled = false;
    let nextTexture: CanvasTexture | null = null;
    image.onload = () => {
      if (cancelled) return;
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      nextTexture = new CanvasTexture(canvas);
      nextTexture.colorSpace = SRGBColorSpace;
      setTexture(nextTexture);
    };
    image.src = objectUrl;
    return () => {
      cancelled = true;
      URL.revokeObjectURL(objectUrl);
      nextTexture?.dispose();
    };
  }, [height, pathsKey, viewBox, width]);
  return texture;
}

function FacePatch({ paths, viewBox, dimensions, width, height, visorY, visorZ, radiusX, radiusY, verticalOffset, gaze, blinkScale }: {
  paths: readonly string[];
  viewBox: string;
  dimensions: [number, number];
  width: number;
  height: number;
  visorY: number;
  visorZ: number;
  radiusX: number;
  radiusY: number;
  verticalOffset: number;
  gaze?: RefObject<Vector2>;
  blinkScale?: RefObject<number>;
}) {
  const group = useRef<Group>(null);
  const texture = usePathTexture(paths, viewBox, dimensions);
  const patchHeight = faceHeightForPatch(width, viewBox);
  const [, , viewBoxWidth, viewBoxHeight] = viewBox.split(" ").map(Number);
  const faceWidth = patchHeight * (viewBoxWidth / viewBoxHeight);
  const geometry = useMemo(() => {
    const geometry = new BufferGeometry();
    const segmentsX = 36;
    const segmentsY = 20;
    const positions: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];
    for (let row = 0; row <= segmentsY; row += 1) {
      const v = row / segmentsY;
      const y = (v - 0.5) * patchHeight;
      for (let column = 0; column <= segmentsX; column += 1) {
        const u = column / segmentsX;
        const x = (u - 0.5) * faceWidth;
        const surface = Math.max(0.02, 1 - (x / radiusX) ** 2 - (y / radiusY) ** 2);
        positions.push(x, y, 0.13 * Math.sqrt(surface) + 0.009);
        uvs.push(u, v);
      }
    }
    for (let row = 0; row < segmentsY; row += 1) {
      for (let column = 0; column < segmentsX; column += 1) {
        const a = row * (segmentsX + 1) + column;
        const b = a + 1;
        const d = a + segmentsX + 1;
        const c = d + 1;
        indices.push(a, b, d, b, c, d);
      }
    }
    geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
    geometry.setAttribute("uv", new Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }, [faceWidth, patchHeight, radiusX, radiusY]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useFrame(() => {
    if (!group.current) return;
    if (gaze?.current) {
      group.current.position.x = gaze.current.x * width * 0.025;
      group.current.position.y = visorY + verticalOffset + gaze.current.y * height * 0.018;
    }
    if (blinkScale) group.current.scale.y = blinkScale.current;
  });
  if (!texture) return null;
  return <mesh ref={group} geometry={geometry} position={[0, visorY + verticalOffset, visorZ + 0.02]}>
    <meshBasicMaterial map={texture} transparent depthWrite={false} side={DoubleSide} toneMapped={false} />
  </mesh>;
}

function faceHeightForPatch(width: number, viewBox: string) {
  const [, , viewWidth, viewHeight] = viewBox.split(" ").map(Number);
  return width * (viewHeight / viewWidth);
}

function FaceDecal({ eyes, mouth, width, height, visorY, visorZ, gaze, blinkScale }: {
  eyes: AvatarConfig["eyes"];
  mouth: AvatarConfig["mouth"];
  width: number;
  height: number;
  visorY: number;
  visorZ: number;
  gaze?: RefObject<Vector2>;
  blinkScale?: RefObject<number>;
}) {
  const faceHeight = Math.min(height * 0.82, width * 1.08);
  const eyePaths = referenceEyePaths[eyes && eyes in referenceEyePaths ? eyes as keyof typeof referenceEyePaths : "round"];
  const mouthPath = referenceMouthPaths[mouth && mouth in referenceMouthPaths ? mouth as keyof typeof referenceMouthPaths : "smile"];
  return <>
    <FacePatch paths={eyePaths} viewBox="0 0 100 100" dimensions={[1024, 1024]} width={faceHeight} height={height} visorY={visorY} visorZ={visorZ} radiusX={width * 0.63} radiusY={height * 0.47} verticalOffset={0} gaze={gaze} blinkScale={blinkScale} />
    <FacePatch paths={[mouthPath]} viewBox="0 0 100 100" dimensions={[1024, 1024]} width={faceHeight} height={height} visorY={visorY} visorZ={visorZ} radiusX={width * 0.63} radiusY={height * 0.47} verticalOffset={0} />
  </>;
}

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return reduced;
}

/** Original field character used in the creator, lobby, and terrain map. */
export function LegacyAvatarMesh({ avatar = defaultAvatar, scale = 1, reactToChoices = false, pointerLook, ready }: { avatar?: AvatarConfig; scale?: number; reactToChoices?: boolean; pointerLook?: RefObject<Vector2>; ready?: boolean }) {
  const figure = useRef<Group>(null);
  const smoothedLook = useRef(new Vector2());
  const features = avatarFeatures(avatar);
  const lastChoice = useRef(`${avatar.shell}/${avatar.body}/${features.eyes}/${features.mouth}`);
  const changedAt = useRef(-Infinity);
  const blinkScale = useRef(1);
  const reducedMotion = useReducedMotion();
  const body = avatar.body === "capsule" ? "tall" : avatar.body;
  const [width, height, depth] = proportions[body];
  const footFit = footFits[body];
  const cubeShellScale = body === "cube" ? 0.92 : 1;
  const cubeShellLift = body === "cube" ? height * 0.1 : 0;
  const bootY = -height * footFit.attach - height * 0.185;
  const footX = width * footFit.spread;
  const footZ = depth * (body === "cube" ? 0.94 : 0.58);
  const visorZ = depth * cubeShellScale + 0.055;
  const visorY = (body === "tall" ? 0.16 : 0.1) + cubeShellLift;
  const shellColor = shellColors[avatar.shell] ?? shellColors.chalk;
  const handX = body === "cube" ? width * 1.04 : width * 0.67;
  const handZ = body === "cube" ? depth * 0.25 : depth * 0.56;
  const handScale: [number, number, number] = body === "cube" ? [0.23, 0.19, 0.2] : [0.22, 0.19, 0.22];
  const choice = `${avatar.shell}/${avatar.body}/${features.eyes}/${features.mouth}`;

  useFrame(({ clock }, delta) => {
    if (!figure.current) return;
    const time = clock.getElapsedTime();
    if (choice !== lastChoice.current) {
      lastChoice.current = choice;
      if (reactToChoices) changedAt.current = time;
    }
    const motion = sampleAvatarMotion(time, changedAt.current, reducedMotion);
    if (pointerLook && !reducedMotion) smoothedLook.current.lerp(pointerLook.current, 1 - Math.exp(-8 * delta));
    else if (reducedMotion) smoothedLook.current.set(0, 0);
    else smoothedLook.current.multiplyScalar(Math.exp(-8 * delta));
    blinkScale.current = motion.blink;
    figure.current.position.y = motion.hop + (reducedMotion ? 0 : Math.sin(time * 1.7) * 0.02);
    figure.current.rotation.y = smoothedLook.current.x * 0.24;
    figure.current.rotation.x = 0;
    figure.current.scale.y = motion.breath;
  });

  return <group scale={scale}><group ref={figure}>
    <mesh position={[0, -0.15, -depth * 0.85]} scale={[width * 0.62, height * 0.52, 0.24]} castShadow><boxGeometry args={[1, 1, 1]} /><meshStandardMaterial color="#435762" metalness={0.3} roughness={0.63} /></mesh>
    {[-1, 1].map((side) => <group key={side}>
      <mesh position={[side * handX, -0.21, handZ]} scale={handScale} castShadow><sphereGeometry args={[1, 18, 14]} /><meshStandardMaterial color={shellColor} roughness={0.45} metalness={0.09} /></mesh>
      <mesh position={[side * footX, bootY, footZ]} scale={[width * 0.29, height * 0.13, depth * 0.36]} castShadow><sphereGeometry args={[1, 22, 16]} /><meshStandardMaterial color="#26343e" roughness={0.76} /></mesh>
      <mesh position={[side * footX, bootY - height * 0.105, footZ + depth * 0.01]} scale={[width * 0.265, height * 0.035, depth * 0.32]} castShadow><sphereGeometry args={[1, 20, 12]} /><meshStandardMaterial color="#18242d" roughness={0.82} /></mesh>
    </group>)}
    {body === "cube" ? <RoundedBox position={[0, cubeShellLift, 0]} args={[width * 2 * cubeShellScale, height * 2 * cubeShellScale, depth * 2 * cubeShellScale]} radius={0.21 * cubeShellScale} smoothness={4} castShadow><meshStandardMaterial color={shellColor} roughness={0.45} metalness={0.09} /></RoundedBox> : <mesh scale={[width, height, depth]} castShadow>
      {body === "scout" ? <octahedronGeometry args={[1, 1]} /> : body === "pebble" ? <dodecahedronGeometry args={[1, 0]} /> : body === "prism" ? <latheGeometry args={[profilePoints.prism, 5]} /> : body === "comet" ? <latheGeometry args={[profilePoints.comet, 32]} /> : body === "tall" ? <latheGeometry args={[profilePoints.tall, 32]} /> : <sphereGeometry args={[1, 32, 24]} />}
      <meshStandardMaterial color={shellColor} roughness={0.45} metalness={0.09} />
    </mesh>}
    <mesh position={[0, visorY, visorZ - 0.04]} scale={[width * 0.69 * cubeShellScale, height * 0.53 * cubeShellScale, 0.16]}><sphereGeometry args={[1, 32, 20]} /><meshStandardMaterial color="#617985" metalness={0.08} roughness={0.72} /></mesh>
    <mesh position={[0, visorY, visorZ + 0.02]} scale={[width * 0.63 * cubeShellScale, height * 0.47 * cubeShellScale, 0.13]}><sphereGeometry args={[1, 32, 20]} /><meshBasicMaterial color="#091722" /></mesh>
    <FaceDecal eyes={features.eyes} mouth={features.mouth} width={width * cubeShellScale} height={height * cubeShellScale} visorY={visorY} visorZ={visorZ} gaze={pointerLook ? smoothedLook : undefined} blinkScale={blinkScale} />
    <mesh position={[0, height + 0.02, 0]}><cylinderGeometry args={[0.045, 0.05, 0.2, 10]} /><meshStandardMaterial color="#697e89" metalness={0.6} roughness={0.36} /></mesh>
    <mesh position={[0, height + 0.16, 0]}><sphereGeometry args={[0.085, 14, 10]} /><meshStandardMaterial color={ready ? "#68c995" : "#e6c876"} emissive={ready ? "#2f8c5e" : "#b48333"} emissiveIntensity={0.5} /></mesh>
  </group></group>;
}
