import { useMemo, useRef, type RefObject } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";
import type { Group } from "three";
import type { HeightGrid } from "../mission/types";
import { sampleDisplayedPosition } from "../terrain/detail-surface";
import type { ReliefScale } from "../terrain/terrain-display";
import { crewDisplayAnchor } from "./astronaut-pose";
import { AstronautModel } from "./AstronautModel";
import {
  crewMembers,
  sampleCrew,
  type CrewId,
  type CrewState,
  type TeamTimeline,
} from "./crew-timeline";
import type { CrewClock } from "./use-crew-playback";
export type CrewSceneProps = {
  timelines: TeamTimeline[];
  clockRef: RefObject<CrewClock>;
  states: CrewState[];
  selectedId: CrewId;
  onSelect: (id: CrewId) => void;
};
export function CrewOverlay({
  timelines,
  clockRef,
  states,
  selectedId,
  onSelect,
  grid,
  detail,
  datum,
  scale,
  portal,
}: CrewSceneProps & {
  grid: HeightGrid;
  detail: HeightGrid | null;
  datum: number;
  scale: ReliefScale;
  portal: RefObject<HTMLDivElement | null>;
}) {
  return (
    <group>
      {crewMembers.map((member) => (
        <CrewFigure
          key={member.id}
          memberId={member.id}
          timeline={timelines.find((t) => t.teamId === member.teamId)!}
          clockRef={clockRef}
          state={states.find((s) => s.member.id === member.id)!}
          selected={selectedId === member.id}
          onSelect={() => onSelect(member.id)}
          grid={grid}
          detail={detail}
          datum={datum}
          scale={scale}
          portal={portal}
        />
      ))}
    </group>
  );
}
function CrewFigure({
  memberId,
  timeline,
  clockRef,
  state,
  selected,
  onSelect,
  grid,
  detail,
  datum,
  scale,
  portal,
}: {
  memberId: CrewId;
  timeline: TeamTimeline;
  clockRef: RefObject<CrewClock>;
  state: CrewState;
  selected: boolean;
  onSelect: () => void;
  grid: HeightGrid;
  detail: HeightGrid | null;
  datum: number;
  scale: ReliefScale;
  portal: RefObject<HTMLDivElement | null>;
}) {
  const root = useRef<Group>(null),
    current = useRef(state),
    feet = useRef<[number, number]>([0, 0]);
  const { invalidate } = useThree();
  const reduced = useMemo(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    [],
  );
  const member = state.member,
    accent = member.teamId === "alpha" ? "#a5e3d1" : "#e7b77b";
  useFrame(() => {
    const snapshot = sampleCrew(timeline, member, clockRef.current.timeSec);
    current.current = snapshot;
    const anchor = crewDisplayAnchor(snapshot.point, memberId, grid);
    const position = sampleDisplayedPosition(
      anchor,
      grid,
      detail,
      datum,
      scale,
    );
    if (root.current && position) {
      root.current.position.set(...position);
      root.current.rotation.y = snapshot.headingRad;
      feet.current = ([-1, 1] as const).map((side) => {
        const foot = {
          x: anchor.x + Math.cos(snapshot.headingRad) * side * 2.3,
          y: anchor.y + Math.sin(snapshot.headingRad) * side * 2.3,
        };
        const sampled = sampleDisplayedPosition(
          foot,
          grid,
          detail,
          datum,
          scale,
        );
        return sampled
          ? Math.max(-0.25, Math.min(0.25, (sampled[1] - position[1]) / 12))
          : 0;
      }) as [number, number];
    }
    if (clockRef.current.playing) invalidate();
  });
  const trail = useMemo(
    () =>
      state.trail
        .map((p) => sampleDisplayedPosition(p, grid, detail, datum, scale, 4))
        .filter((p): p is [number, number, number] => p !== null),
    [state, grid, detail, datum, scale],
  );
  return (
    <group>
      {memberId.endsWith("1") && trail.length > 1 && (
        <Line
          points={trail}
          color={accent}
          lineWidth={2}
          dashed={member.teamId === "bravo"}
          dashSize={18}
          gapSize={10}
          depthTest={false}
          transparent
          opacity={0.6}
          renderOrder={6}
        />
      )}
      <group ref={root}>
        <group scale={12}>
          <AstronautModel
            accent={accent}
            activity={() => current.current.activity}
            playing={() => clockRef.current.playing}
            reducedMotion={reduced}
            footHeights={() => feet.current}
            onSelect={onSelect}
          />
        </group>
        {selected && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 1, 0]}>
            <ringGeometry args={[9, 10, 32]} />
            <meshBasicMaterial color={accent} side={2} depthTest={false} />
          </mesh>
        )}
        <Html
          style={{ pointerEvents: "auto" }}
          portal={portal as RefObject<HTMLElement>}
          center
          position={[0, 34, 0]}
        >
          <button
            className={`crew-map-label ${member.teamId}`}
            style={{
              transform: `translate(${memberId.endsWith("1") ? -18 : 18}px, ${member.teamId === "alpha" ? -8 : 8}px)`,
            }}
            aria-label={`Locate crew ${memberId}`}
            onClick={onSelect}
          >
            {memberId}
          </button>
        </Html>
      </group>
    </group>
  );
}
