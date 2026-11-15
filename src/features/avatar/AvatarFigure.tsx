"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useFrame } from "@react-three/fiber";
import { AvatarFace } from "./AvatarFace";
import { AvatarBoots } from "./AvatarBoots";
import { sampleAvatarMotion } from "./avatar-motion";
import { avatarFeatures } from "./avatar-expression";
import { BufferGeometry, CapsuleGeometry, Float32BufferAttribute, Mesh, MeshBasicMaterial, Raycaster, SphereGeometry, Vector2, Vector3, type Group } from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { AvatarConfig } from "./avatar-types";

const scoutCrownHeight = 0.68;
const scoutBaseHeight = -0.79;
const scoutVisorTilt = 0.26;
const scoutAssemblyScale = 0.96;
const scoutVerticalScale = scoutAssemblyScale * 0.97;

function scoutShellGeometry() {
  // Normalize the reference to 100 px per model unit. The front is 180 px
  // wide, and the back facet tapers from 94 to 44 px over 60 px of height.
  const rearDepth = (y: number) => -0.705 - 0.12 * (y - 0.12);
  const frontDepth = (y: number) => 0.64 - scoutVisorTilt * y;
  const landmarks = [
    // Crown and base footprints.
    [0.34, scoutCrownHeight, 0.22],
    [0.38, scoutCrownHeight, -0.23],
    [0.42, scoutBaseHeight, 0.23],
    [0.34, scoutBaseHeight, -0.27],
    // Follow the visor's hexagonal outline with a slim shell margin.
    [0.36, 0.604, frontDepth(0.604)],
    [0.694, 0.105, frontDepth(0.105)],
    [0.36, -0.394, frontDepth(-0.394)],
    // Roll the lower front back toward the boots in two facets.
    [0.46, -0.57, 0.54],
    [0.51, -0.68, 0.38],
    // Side ridge rises from the rear point, then drops toward the visor.
    [0.66, 0.55, -0.17],
    [0.90, -0.08, -0.15],
    [0.80, -0.06, -0.42],
    [0.69, -0.51, -0.24],
    // Central back facet and the clipped corners around it.
    [0.47, 0.12, rearDepth(0.12)],
    [0.22, -0.48, rearDepth(-0.48)],
    [0.39, 0.53, -0.48],
    [0.40, -0.64, -0.37],
  ];
  return new ConvexGeometry(landmarks.flatMap(([x, y, z]) => [
    new Vector3(x, y, z),
    new Vector3(-x, y, z),
  ]));
}

function shellGeometry(body: AvatarConfig["body"]) {
  if (body === "cube") return new RoundedBoxGeometry(1.64, 1.58, 1.46, 10, 0.38);
  if (body === "tall") return new CapsuleGeometry(0.64, 0.78, 40, 128, 80);
  if (body === "capsule") return new CapsuleGeometry(0.64, 0.78, 16, 48);
  if (body === "scout") return scoutShellGeometry();
  if (body === "prism") {
    // Rounded cross sections give the base a rolled underside in both views.
    const profile = [
      [-0.755, 0, 0], [-0.755, 0.68, 0.54], [-0.741, 0.79, 0.63],
      [-0.705, 0.86, 0.70], [-0.65, 0.89, 0.73], [-0.57, 0.88, 0.73],
      [0.59, 0.52, 0.44], [0.68, 0.49, 0.41], [0.745, 0.45, 0.37],
      [0.78, 0.37, 0.31], [0.79, 0, 0],
    ];
    const segments = 96;
    const vertices: number[] = [];
    const indices: number[] = [];
    for (const [y, width, depth] of profile) {
      for (let i = 0; i < segments; i++) {
        const angle = i * 2 * Math.PI / segments;
        const x = Math.cos(angle), z = Math.sin(angle);
        vertices.push(width * Math.sign(x) * Math.abs(x) ** 0.63, y,
          depth * Math.sign(z) * Math.abs(z) ** 0.63);
      }
    }
    for (let ring = 0; ring < profile.length - 1; ring++) {
      for (let i = 0; i < segments; i++) {
        const a = ring * segments + i, b = ring * segments + (i + 1) % segments;
        if (ring > 0) indices.push(a, a + segments, b);
        if (ring < profile.length - 2) indices.push(b, a + segments, b + segments);
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
  if (body === "comet") {
    // A round core and a small rounded terminal form a simple, continuous
    // tapered shell. Avoid extra saddle deformations across the connecting patch.
    const core = new SphereGeometry(1, 64, 48);
    const tip = new SphereGeometry(1, 32, 24);
    const points: Vector3[] = [];
    for (let i = 0; i < core.attributes.position.count; i++) {
      const v = new Vector3().fromBufferAttribute(core.attributes.position, i);
      v.multiply(new Vector3(0.85, 0.81, 0.81));
      if (v.z < 0) v.z *= 0.78;
      points.push(v);
    }
    for (let i = 0; i < tip.attributes.position.count; i++) {
      const v = new Vector3().fromBufferAttribute(tip.attributes.position, i);
      points.push(v.multiply(new Vector3(0.06, 0.06, 0.078)).add(new Vector3(1.36, 0.81, -0.36)));
    }
    core.dispose(); tip.dispose();
    const hull = new ConvexGeometry(points);
    hull.deleteAttribute("normal");
    const shell = mergeVertices(hull);
    hull.dispose();
    shell.computeVertexNormals();
    return shell;
  }
  return new SphereGeometry(0.85, 64, 48);
}

export function AvatarFigure({ avatar, color, pointerLook, reactToChoices = false, ready = false }: { avatar: AvatarConfig; color: string; pointerLook?: RefObject<Vector2>; reactToChoices?: boolean; ready?: boolean }) {
  const animatedFace = ["orb", "tall", "scout", "prism", "comet", "cube"].includes(avatar.body);
  const figure = useRef<Group>(null);
  const gaze = useRef(new Vector2());
  const blink = useRef(1);
  const changedAt = useRef(-Infinity);
  const features = avatarFeatures(avatar);
  const choice = [avatar.body, avatar.shell, features.eyes, features.mouth].join("/");
  const lastChoice = useRef(choice);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useFrame(({ clock }, delta) => {
    if (!figure.current) return;
    const time = clock.getElapsedTime();
    if (choice !== lastChoice.current) { lastChoice.current = choice; if (reactToChoices) changedAt.current = time; }
    const reduced = reducedMotion || !animatedFace;
    const motion = sampleAvatarMotion(time, changedAt.current, reduced);
    if (pointerLook && !reduced) gaze.current.lerp(pointerLook.current, 1 - Math.exp(-8 * delta));
    else gaze.current.set(0, 0);
    blink.current = motion.blink;
    figure.current.position.y = motion.hop + (reduced ? 0 : Math.sin(time * 1.7) * 0.02);
    figure.current.rotation.y = gaze.current.x * 0.24;
    figure.current.scale.y = motion.breath;
  });
  const model = useMemo(() => {
    const body = avatar.body;
    const shell = shellGeometry(body);
    const probeMaterial = new MeshBasicMaterial();
    const probe = new Mesh(shell, probeMaterial);
    probe.updateMatrixWorld();
    const ray = new Raycaster();
    const surface = (x: number, y: number, offset = 0) => {
      ray.set(new Vector3(x, y, 3), new Vector3(0, 0, -1));
      return (ray.intersectObject(probe, false)[0]?.point.z ?? 0.3) + offset;
    };
    const tall = body === "tall" || body === "capsule";
    const width = body === "cube" ? 0.62 : tall ? 0.45 : body === "scout" ? 0.66 : body === "comet" ? 0.65 : body === "orb" ? 0.64 : 0.59;
    const height = body === "tall" ? 0.64 : tall ? 0.7 : body === "scout" ? 0.52 : body === "prism" ? 0.49 : body === "comet" ? 0.54 : body === "cube" ? 0.52 : body === "orb" ? 0.54 : 0.52;
    const centerY = body === "scout" ? 0.105 : body === "tall" ? 0.08 : tall ? 0.12 : 0.08;
    const power = body === "cube" ? 3.5 : tall ? 2.7 : body === "prism" ? 3.2 : 2;
    // A visor is a manufactured smooth cap, even on a faceted shell. Fit the
    // cap once, then use that SAME surface for the screen and all face graphics.
    const curvature = body === "cube" ? [0.38, 0.22] : body === "prism" ? [0.28, 0.26] : body === "scout" ? [0.27, 0.37] : tall ? [0.85, 0.12] : [0.64, 0.64];
    const sag = (x: number, y: number) => {
      const vertical = y - centerY;
      return curvature[0] * x * x + curvature[1] * vertical ** 2
        + (body === "scout" ? scoutVisorTilt * vertical : body === "prism" ? 0.28 * vertical : 0);
    };
    function contour(angle: number, radius: number): [number, number] {
      let x = Math.sign(Math.cos(angle)) * Math.pow(Math.abs(Math.cos(angle)), 2 / power);
      let y = Math.sign(Math.sin(angle)) * Math.pow(Math.abs(Math.sin(angle)), 2 / power);
      if (body === "scout") {
        const sector = Math.PI / 3;
        const phase = (angle % sector + sector) % sector;
        const fromCorner = Math.min(phase, sector - phase);
        const rounding = 0.19;
        const softened = fromCorner < rounding
          ? (fromCorner ** 2 + rounding ** 2) / (2 * rounding)
          : fromCorner;
        const hex = Math.cos(sector / 2) / Math.cos(sector / 2 - softened);
        x = Math.cos(angle) * hex;
        y = Math.sin(angle) * hex;
      }
      x *= width * radius; y *= height * radius;
      if (body === "prism") x *= 1 - y * 0.3;
      return [x, y + centerY];
    }
    const cometBaseDepth = (x: number, y: number) => 0.81 * Math.sqrt(Math.max(0.001, 1 - (x / 0.85) ** 2 - (y / 0.81) ** 2));
    let cometSeatOffset = 0.012;
    let capDepth = -Infinity;
    for (let r = 0; r <= 24; r++) for (let i = 0; i < 128; i++) {
      const [x, y] = contour(i / 128 * Math.PI * 2, r / 24);
      const shellDepth = surface(x, y);
      capDepth = Math.max(capDepth, shellDepth + sag(x, y) + 0.009);
      if (body === "comet") cometSeatOffset = Math.max(cometSeatOffset, shellDepth - cometBaseDepth(x, y) + 0.012);
    }
    const cap = body === "orb"
      ? (x: number, y: number) => Math.sqrt(Math.max(0.001, 0.854 ** 2 - x * x - y * y))
      : body === "comet"
        ? (x: number, y: number) => cometBaseDepth(x, y) + cometSeatOffset
      : body === "tall"
        ? (x: number, y: number) => {
            // Use one continuous crown across the straight section and domes.
            const ySquared = y * y;
            const verticalSag = ySquared * (0.02 + 0.28 * ySquared);
            return Math.sqrt(Math.max(0.001, 0.652 ** 2 - x * x - verticalSag));
          }
        : (x: number, y: number) => capDepth - sag(x, y);
    function disk(point: (angle: number, radius: number) => [number, number], depth: (x: number, y: number) => number) {
      const vertices: number[] = [], indices: number[] = [];
      const segments = 128, rings = 28;
      const [cx, cy] = point(0, 0);
      vertices.push(cx, cy, depth(cx, cy));
      for (let r = 1; r <= rings; r++) for (let i = 0; i < segments; i++) {
        const [x, y] = point(i / segments * Math.PI * 2, r / rings);
        vertices.push(x, y, depth(x, y));
        const current = 1 + (r - 1) * segments + i;
        const next = 1 + (r - 1) * segments + (i + 1) % segments;
        if (r === 1) indices.push(0, current, next);
        else {
          const inner = current - segments, innerNext = next - segments;
          indices.push(inner, current, next, inner, next, innerNext);
        }
      }
      return geometry(vertices, indices);
    }
    function geometry(vertices: number[], indices: number[]) {
      const result = new BufferGeometry();
      result.setAttribute("position", new Float32BufferAttribute(vertices, 3));
      result.setIndex(indices); result.computeVertexNormals();
      return result;
    }
    const screen = disk((a, r) => contour(a, r * 0.935), cap);
    function tallSeatDepth(x: number, y: number, depth: number) {
      const radius = (Math.abs(x / width) ** power + Math.abs((y - centerY) / height) ** power) ** (1 / power);
      // Keep the full blend under the screen and rim, away from the exposed shell.
      const t = Math.min(1, Math.max(0, (radius - 0.48) / 0.49));
      const blend = t * t * t * (10 + t * (-15 + 6 * t));
      const seat = Math.min(depth, 0.625 - 0.32 * x * x - 0.14 * y * y);
      const seatedDepth = seat + (depth - seat) * blend;
      // Ease the white strip beside the visor's upper section, below its tip.
      const shoulderY = (y - 0.45) / 0.16;
      const shoulderX = x / 0.48;
      const shoulder = Math.max(0, 1 - shoulderY ** 2 - shoulderX ** 2);
      const shoulderPlane = 0.616 - 0.10 * (y - 0.45);
      const flatten = Math.max(0, seatedDepth - shoulderPlane);
      return seatedDepth - flatten * shoulder ** 3;
    }
    if (body === "tall") {
      const positions = shell.attributes.position;
      for (let i = 0; i < positions.count; i++) {
        const z = positions.getZ(i);
        if (z > 0) positions.setZ(i, tallSeatDepth(positions.getX(i), positions.getY(i), z));
      }
      positions.needsUpdate = true;
      shell.computeVertexNormals();
    }
    // An actual annular bezel, with a rounded lip and a skirt meeting the shell.
    const rimVertices: number[] = [], rimIndices: number[] = [];
    const bands = 24, segments = 128;
    function tallRimPoint(angle: number, t: number): [number, number, number] {
      const [innerX, innerY] = contour(angle, 0.932);
      const [beforeX, beforeY] = contour(angle - 0.001, 0.932);
      const [afterX, afterY] = contour(angle + 0.001, 0.932);
      const tangentX = afterX - beforeX, tangentY = afterY - beforeY;
      const tangentLength = Math.hypot(tangentX, tangentY);
      const normalX = tangentY / tangentLength, normalY = -tangentX / tangentLength;
      const innerDepth = cap(innerX, innerY);
      // Sweep a constant-width band along the screen perimeter. Measure the
      // width on the curved visor, rather than stretching it radially.
      const faceWidth = 0.034;
      const faceT = Math.min(1, t / 0.75);
      // Round the outer corner most at the marked upper tip, fading the
      // treatment out along the sides. The full band width stays the same.
      const upperTip = Math.max(0, Math.sin(angle)) ** 4;
      const roundStart = 1 - 0.48 * upperTip;
      const roundT = upperTip > 0 ? Math.max(0, (faceT - roundStart) / (1 - roundStart || 1)) : 0;
      const cornerAngle = roundT * Math.PI / 2;
      const widthT = faceT <= roundStart ? faceT : roundStart + (1 - roundStart) * Math.sin(cornerAngle);
      let low = 0, high = faceWidth * widthT;
      for (let step = 0; step < 16; step++) {
        const offset = (low + high) / 2;
        const depth = cap(innerX + normalX * offset, innerY + normalY * offset);
        if (Math.hypot(offset, depth - innerDepth) < faceWidth * widthT) low = offset;
        else high = offset;
      }
      const offset = (low + high) / 2;
      const x = innerX + normalX * offset, y = innerY + normalY * offset;
      const cornerDrop = 0.012 * upperTip * (1 - Math.cos(cornerAngle));
      const crown = cap(x, y) + 0.006 * Math.sin(widthT * Math.PI / 2) - cornerDrop;
      const skirtT = Math.max(0, (t - 0.75) / 0.25);
      const dome = Math.max(0, Math.abs(y) - 0.39);
      const capsuleDepth = Math.sqrt(0.64 ** 2 - x * x - dome * dome);
      const shellDepth = tallSeatDepth(x, y, capsuleDepth) - 0.002;
      // The skirt closes the gap behind the band without changing its width.
      return [x, y, crown + (Math.min(shellDepth, crown) - crown) * skirtT];
    }
    const fittedRim = body === "comet" || body === "cube" ? Array.from({ length: segments }, (_, i) => {
      const angle = i / segments * Math.PI * 2;
      const [x, y] = contour(angle, 0.932);
      const [beforeX, beforeY] = contour(angle - 0.001, 0.932);
      const [afterX, afterY] = contour(angle + 0.001, 0.932);
      const normal = new Vector2(afterY - beforeY, beforeX - afterX).normalize();
      const innerDepth = cap(x, y);
      const bandWidth = 0.06;
      let low = 0, high = bandWidth;
      for (let step = 0; step < 16; step++) {
        const offset = (low + high) / 2;
        const depth = cap(x + normal.x * offset, y + normal.y * offset);
        if (Math.hypot(offset, depth - innerDepth) < bandWidth) low = offset;
        else high = offset;
      }
      return { x, y, nx: normal.x, ny: normal.y, width: (low + high) / 2 };
    }) : [];
    for (let band = 0; band <= bands; band++) for (let i = 0; i < segments; i++) {
      const t = band / bands;
      const angle = i / segments * Math.PI * 2;
      if (body === "tall") {
        rimVertices.push(...tallRimPoint(angle, t));
      } else if (body === "comet" || body === "cube") {
        const edge = fittedRim[i];
        const offset = edge.width * Math.sin(t * Math.PI / 2);
        const x = edge.x + edge.nx * offset, y = edge.y + edge.ny * offset;
        const skirt = Math.max(0, (t - 0.7) / 0.3);
        const blend = skirt * skirt * (3 - 2 * skirt);
        const crown = cap(x, y) + 0.008 * Math.sin(t * Math.PI);
        rimVertices.push(x, y, crown + (surface(x, y, -0.002) - crown) * blend);
      } else {
        const [x, y] = contour(angle, 0.932 + (body === "scout" ? 0.11 : 0.068) * t);
        const blend = t * t * (3 - 2 * t);
        const lip = body === "orb"
          ? (1 - Math.cos(t * 2 * Math.PI)) * 0.011
          : Math.sin(t * Math.PI) * (body === "scout" ? 0.013 : 0.009);
        rimVertices.push(x, y, cap(x, y) * (1 - blend) + surface(x, y, 0.003) * blend + lip);
      }
      if (band < bands) {
        const a = band * segments + i, b = band * segments + (i + 1) % segments;
        rimIndices.push(a, a + segments, b, b, a + segments, b + segments);
      }
    }
    const rim = geometry(rimVertices, rimIndices);
    const eyes = [-1, 1].map(side => disk((a, r) => [side * width * 0.36 + Math.cos(a) * 0.105 * r, centerY + height * 0.23 + Math.sin(a) * 0.125 * r], (x, y) => cap(x, y) + 0.0015));
    // Flat ribbon with round ends: no protruding tubes or floating eyeballs.
    const smileVertices: number[] = [], smileIndices: number[] = [];
    const smileRadius = 0.026;
    const path = (t: number) => {
      const x = (t - 0.5) * width * 0.86;
      const y = centerY - height * 0.16 - Math.sin(t * Math.PI) * height * 0.22;
      return [x, y];
    };
    for (let i = 0; i <= 64; i++) {
      const t = i / 64, [x, y] = path(t);
      const dx = width * 0.86, dy = -Math.cos(t * Math.PI) * Math.PI * height * 0.22;
      const length = Math.hypot(dx, dy);
      for (const side of [-1, 1]) {
        const px = x - dy / length * smileRadius * side, py = y + dx / length * smileRadius * side;
        smileVertices.push(px, py, cap(px, py) + 0.0015);
      }
      if (i < 64) { const a = i * 2; smileIndices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    }
    const smile = geometry(smileVertices, smileIndices);
    const smileEnds = [0, 1].map(t => disk((a, r) => { const [x, y] = path(t); return [x + Math.cos(a) * smileRadius * r, y + Math.sin(a) * smileRadius * r]; }, (x, y) => cap(x, y) + 0.0016));
    probeMaterial.dispose();
    return { cap, shell, rim, screen, smile, smileEnds, eyes, bottom: body === "comet" ? -0.81 : body === "scout" ? scoutBaseHeight : tall ? -1.03 : body === "prism" ? -0.755 : body === "cube" ? -0.79 : -0.85, top: body === "comet" ? 0.81 : body === "scout" ? scoutCrownHeight : tall ? 1.03 : body === "prism" ? 0.79 : body === "cube" ? 0.79 : 0.85 };
  }, [avatar.body]);
  useEffect(() => () => { model.shell.dispose(); model.rim.dispose(); model.screen.dispose(); model.smile.dispose(); model.eyes.forEach(g => g.dispose()); model.smileEnds.forEach(g => g.dispose()); }, [model]);
  const scout = avatar.body === "scout";
  // Keep the soles at the same height when scaling the assembled model.
  const lift = -1 - model.bottom + (scout ? -0.93 * (1 - scoutVerticalScale) : 0);
  return <group ref={figure}>
    {/* Scale the assembled Scout so the visor and hands stay seated on the shell. */}
    <group position={[0, lift, 0]} scale={scout ? [0.93 * scoutAssemblyScale, scoutVerticalScale, scoutAssemblyScale] : 1}>
    <mesh geometry={model.shell} castShadow receiveShadow><meshStandardMaterial color={color} roughness={0.48} metalness={0.02} flatShading={avatar.body === "scout"} /></mesh>
    <mesh geometry={model.rim}><meshStandardMaterial color="#607780" roughness={0.48} metalness={0.24} /></mesh>
    <mesh geometry={model.screen}><meshBasicMaterial color="#11232d" /></mesh>
    {animatedFace ? <AvatarFace avatar={avatar} cap={model.cap} gaze={gaze} blink={blink} /> : [...model.eyes, model.smile, ...model.smileEnds].map((geometry, i) => <mesh key={i} geometry={geometry}><meshBasicMaterial color="#fcfffd" /></mesh>)}
    {[-1, 1].map(side => <group key={side}>
      <mesh position={[side * (avatar.body === "tall" ? 0.64 : avatar.body === "scout" ? 0.73 : avatar.body === "prism" ? 0.86 : avatar.body === "comet" ? 0.86 : avatar.body === "cube" ? 0.87 : 0.79), avatar.body === "cube" ? -0.33 : -0.29, avatar.body === "scout" ? 0.30 : avatar.body === "prism" ? 0.17 : 0.05]} scale={[0.14, 0.18, 0.17]} castShadow><sphereGeometry args={[1, 32, 24]} /><meshStandardMaterial color={color} roughness={0.5} /></mesh>
      {!animatedFace && <mesh position={[side * 0.32, model.bottom - 0.015, 0.13]} scale={[0.255, 0.125, 0.32]} castShadow><sphereGeometry args={[1, 32, 24]} /><meshStandardMaterial color="#25333a" roughness={0.62} /></mesh>}
    </group>)}
    {animatedFace && <AvatarBoots tall={avatar.body === "tall"} scout={avatar.body === "scout"} prism={avatar.body === "prism"} cube={avatar.body === "cube"} />}
    <mesh position={[0, model.top + 0.045, 0]}><cylinderGeometry args={[0.026, 0.03, 0.16, 20]} /><meshStandardMaterial color="#536c77" roughness={0.45} /></mesh>
    <mesh position={[0, model.top + 0.16, 0]} castShadow><sphereGeometry args={[0.085, 32, 24]} /><meshStandardMaterial color={ready ? "#68c995" : "#e4bd55"} emissive={ready ? "#2f8c5e" : "#000000"} emissiveIntensity={ready ? 0.5 : 0} roughness={0.35} metalness={0.12} /></mesh>
  </group></group>;
}
