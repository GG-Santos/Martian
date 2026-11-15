import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Group } from "three";
import { walkingMotion, solveLeg } from "./astronaut-pose";
import type { CrewActivity } from "./crew-timeline";
const suit = "#dce2df",
  joint = "#34414b";
export function AstronautModel({
  accent,
  activity,
  playing,
  reducedMotion,
  footHeights,
  onSelect,
}: {
  accent: string;
  activity: () => CrewActivity;
  playing: () => boolean;
  reducedMotion: boolean;
  footHeights: () => [number, number];
  onSelect: () => void;
}) {
  const leftArm = useRef<Group>(null),
    rightArm = useRef<Group>(null),
    leftLeg = useRef<Group>(null),
    rightLeg = useRef<Group>(null),
    torso = useRef<Group>(null),
    leftKnee = useRef<Group>(null),
    rightKnee = useRef<Group>(null),
    leftBoot = useRef<Group>(null),
    rightBoot = useRef<Group>(null);
  const gaitPhase = useRef(0);
  useFrame((_, delta) => {
    if (playing() && !reducedMotion) gaitPhase.current += delta * 5.8;
    const mode = activity(),
      phase = gaitPhase.current;
    const { swing } = walkingMotion(mode, reducedMotion, phase);
    const feet = footHeights();
    if (leftArm.current)
      leftArm.current.rotation.x = mode === "science" ? -0.85 : -swing * 0.7;
    if (rightArm.current)
      rightArm.current.rotation.x = mode === "science" ? -0.65 : swing * 0.7;
    const hipShift = Math.min(0, ...feet);
    for (const [hip, knee, boot, index] of [
      [leftLeg, leftKnee, leftBoot, 0],
      [rightLeg, rightKnee, rightBoot, 1],
    ] as const) {
      const { forward, lift } = walkingMotion(
        mode,
        reducedMotion,
        phase + index * Math.PI,
      );
      const pose = solveLeg(0.94 + hipShift - feet[index] - lift, forward);
      if (hip.current) {
        hip.current.rotation.x = pose.hip;
        hip.current.position.y = 1.04 + hipShift;
      }
      if (knee.current) knee.current.rotation.x = pose.knee;
      if (boot.current) boot.current.rotation.x = -pose.hip - pose.knee;
    }
    if (torso.current) {
      torso.current.rotation.x = mode === "science" ? 0.12 : 0;
      torso.current.position.y = hipShift;
    }
  });
  return (
    <group
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
    >
      <group ref={torso}>
        <mesh position={[0, 1.4, 0]}>
          <capsuleGeometry args={[0.33, 0.46, 6, 10]} />
          <meshStandardMaterial color={suit} roughness={0.8} />
        </mesh>
        <mesh position={[0, 1.46, -0.3]}>
          <boxGeometry args={[0.54, 0.7, 0.3]} />
          <meshStandardMaterial color="#a1b1b5" />
        </mesh>
        <mesh position={[0, 1.49, 0.315]}>
          <boxGeometry args={[0.4, 0.18, 0.06]} />
          <meshStandardMaterial color={accent} />
        </mesh>
        <mesh position={[0, 2, 0]}>
          <sphereGeometry args={[0.34, 16, 12]} />
          <meshStandardMaterial color={suit} />
        </mesh>
        <mesh
          position={[0, 2.02, 0.19]}
          rotation={[0.1, 0, 0]}
          scale={[1, 0.76, 0.5]}
        >
          <sphereGeometry args={[0.285, 16, 10]} />
          <meshStandardMaterial
            color="#17252e"
            metalness={0.65}
            roughness={0.25}
          />
        </mesh>
        <mesh position={[0.28, 2.12, 0]}>
          <boxGeometry args={[0.06, 0.18, 0.1]} />
          <meshStandardMaterial color={accent} />
        </mesh>
        {(
          [
            [-1, leftArm],
            [1, rightArm],
          ] as const
        ).map(([side, ref]) => (
          <group key={side} ref={ref} position={[side * 0.44, 1.64, 0]}>
            <mesh position={[0, -0.23, 0]}>
              <capsuleGeometry args={[0.12, 0.29, 4, 8]} />
              <meshStandardMaterial color={suit} />
            </mesh>
            <mesh position={[0, -0.46, 0]}>
              <sphereGeometry args={[0.115, 8, 6]} />
              <meshStandardMaterial color={joint} />
            </mesh>
            <mesh position={[0, -0.65, 0.05]} rotation={[0.15, 0, 0]}>
              <capsuleGeometry args={[0.11, 0.25, 4, 8]} />
              <meshStandardMaterial color={suit} />
            </mesh>
            <mesh position={[0, -0.85, 0.08]}>
              <sphereGeometry args={[0.12, 8, 6]} />
              <meshStandardMaterial color="#91a3ac" />
            </mesh>
          </group>
        ))}
      </group>
      {(
        [
          [-1, leftLeg, leftKnee, leftBoot],
          [1, rightLeg, rightKnee, rightBoot],
        ] as const
      ).map(([side, ref, knee, boot]) => (
        <group key={side} ref={ref} position={[side * 0.19, 1.04, 0]}>
          <mesh position={[0, -0.23, 0]}>
            <capsuleGeometry args={[0.145, 0.27, 4, 8]} />
            <meshStandardMaterial color={suit} />
          </mesh>
          <mesh position={[0, -0.5, 0]}>
            <sphereGeometry args={[0.14, 8, 6]} />
            <meshStandardMaterial color={joint} />
          </mesh>
          <group ref={knee} position={[0, -0.5, 0]}>
            <mesh position={[0, -0.24, 0]}>
              <capsuleGeometry args={[0.125, 0.25, 4, 8]} />
              <meshStandardMaterial color={suit} />
            </mesh>
            <group ref={boot} position={[0, -0.5, 0]}>
              <mesh position={[0, 0, 0.1]}>
                <boxGeometry args={[0.29, 0.18, 0.46]} />
                <meshStandardMaterial color="#53656f" />
              </mesh>
            </group>
          </group>
        </group>
      ))}
    </group>
  );
}
