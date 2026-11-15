export function HabitatModel() {
  return (
    <group scale={9}>
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[5.4, 0.25, 3.4]} />
        <meshStandardMaterial color="#5f6d74" />
      </mesh>
      {[-1.8, 0, 1.8].map((x, i) => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, i === 1 ? 1.05 : 0.8, 0]}>
            <cylinderGeometry
              args={[
                i === 1 ? 0.95 : 0.7,
                i === 1 ? 0.95 : 0.7,
                i === 1 ? 1.9 : 1.4,
                20,
              ]}
            />
            <meshStandardMaterial color="#d9dfda" roughness={0.8} />
          </mesh>
          <mesh position={[0, i === 1 ? 2.04 : 1.55, 0]}>
            <cylinderGeometry
              args={[i === 1 ? 1 : 0.75, i === 1 ? 1 : 0.75, 0.13, 20]}
            />
            <meshStandardMaterial color="#8f9da2" />
          </mesh>
          <mesh position={[0, 0.85, 0.71]}>
            <boxGeometry args={[0.38, 0.48, 0.06]} />
            <meshStandardMaterial color="#26343d" />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.62, 1]}>
        <boxGeometry args={[0.72, 1.05, 0.72]} />
        <meshStandardMaterial color="#293b42" />
      </mesh>
      <mesh position={[-0.4, 3, 0]}>
        <cylinderGeometry args={[0.07, 0.1, 2.1, 8]} />
        <meshStandardMaterial color="#697e87" />
      </mesh>
      <group position={[-0.4, 4.1, 0]} rotation={[0.6, 0, -0.35]}>
        <mesh>
          <sphereGeometry
            args={[0.95, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.38]}
          />
          <meshStandardMaterial color="#d0dbdb" side={2} />
        </mesh>
        <mesh position={[0, 0.2, 0]}>
          <cylinderGeometry args={[0.03, 0.03, 1.1, 6]} />
          <meshStandardMaterial color="#526872" />
        </mesh>
      </group>
    </group>
  );
}
