"use client";

import { useEffect, useMemo } from "react";
import { Line } from "@react-three/drei";
import { BufferGeometry, Float32BufferAttribute } from "three";
import { constellationSegments, skyStars, starPosition } from "./sky";

function geometryFor(positions: number[]) {
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return geometry;
}

export function SkyField({ constellations, groupRef }: { constellations: boolean; groupRef?: React.RefObject<import("three").Group | null> }) {
  const { dim, bright } = useMemo(() => {
    const dimPoints: number[] = [];
    const brightPoints: number[] = [];
    for (const star of skyStars) (star[3] <= 3 ? brightPoints : dimPoints).push(...starPosition(star));
    return { dim: geometryFor(dimPoints), bright: geometryFor(brightPoints) };
  }, []);
  useEffect(() => () => { dim.dispose(); bright.dispose(); }, [dim, bright]);
  return <group ref={groupRef} rotation={[0, -4.1 * Math.PI / 12, 0]}>
    <points geometry={dim}><pointsMaterial color="#c3d2d7" size={1.2} sizeAttenuation={false} transparent opacity={0.72} depthWrite={false} /></points>
    <points geometry={bright}><pointsMaterial color="#f3efe5" size={2.3} sizeAttenuation={false} depthWrite={false} /></points>
    {constellations && constellationSegments.map(({ name, from, to }) => <Line key={`${name}-${from[0]}-${to[0]}`} points={[starPosition(from, 79.8), starPosition(to, 79.8)]} color="#a8c4cc" lineWidth={1.4} transparent opacity={0.5} depthWrite={false} />)}
  </group>;
}
