"use client";

import { useEffect, useMemo } from "react";
import { LatheGeometry, SplineCurve, Vector2 } from "three";

/** A compact toe and tucked heel, with a broad, genuinely flat contact patch. */
export function AvatarBoots({ tall = false, scout = false, prism = false, cube = false }: { tall?: boolean; scout?: boolean; prism?: boolean; cube?: boolean }) {
  const boot = useMemo(() => {
    const profile = new SplineCurve([
      new Vector2(0, 0), new Vector2(0.65, 0),
      new Vector2(0.9, 0.012), new Vector2(1, 0.05),
      new Vector2(0.99, 0.09), new Vector2(0.86, 0.15),
      new Vector2(0.58, 0.2), new Vector2(0, 0.225),
    ]);
    const points = profile.getPoints(64).map(point => new Vector2(Math.max(0, point.x), Math.max(0, point.y)));
    const geometry = new LatheGeometry(points, 64);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const heelTaper = 0.88 + Math.max(0, z) * 0.12;
      positions.setXYZ(i, x * 0.245 * heelTaper, y, z * 0.25 - y * 0.16);
    }
    geometry.computeVertexNormals();
    return geometry;
  }, []);
  useEffect(() => () => boot.dispose(), [boot]);
  return <group>
    {[-1, 1].map(side => <mesh key={side} geometry={boot} position={[side * (tall ? 0.25 : scout ? 0.263 : prism ? 0.33 : 0.3), tall ? -1.16 : scout || prism ? -0.93 : -0.99, scout ? 0.06 : prism ? 0.04 : 0.075]} scale={cube ? [1.08, 1, 1.3] : tall ? [0.87, 0.9, 0.92] : scout || prism ? [1.08, 0.95, 1.14] : 1} rotation={[0, side * 0.06, 0]} castShadow receiveShadow>
      <meshStandardMaterial color="#25333a" roughness={0.66} metalness={0.03} />
    </mesh>)}
  </group>;
}
