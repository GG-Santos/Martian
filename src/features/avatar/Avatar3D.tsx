"use client";

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import { Plus } from "lucide-react";
import { Vector2 } from "three";
import type { RoomMember } from "../session/protocol";
import { defaultAvatar, type AvatarConfig } from "./avatar-types";
import { AvatarFigure } from "./AvatarFigure";
import { LegacyAvatarMesh } from "./LegacyAvatarMesh";
import { avatarModelFit } from "./avatar-model-fit";

const shellColors: Record<AvatarConfig["shell"], string> = {
  chalk: "#e7e4d9", mint: "#8fc9b9", coral: "#d79c86", violet: "#a8a0d2",
  copper: "#bb795c", sky: "#80b9d7", moss: "#a5b678", slate: "#778da3",
  amber: "#e2ac51", ruby: "#c85f70", teal: "#47b5a8", indigo: "#666fba",
};

/** Shared character renderer for the creator, lobby, and terrain map. */
export function AvatarMesh({ avatar = defaultAvatar, scale = 1, reactToChoices = false, pointerLook, ready }: { avatar?: AvatarConfig; scale?: number; reactToChoices?: boolean; pointerLook?: RefObject<Vector2>; ready?: boolean }) {
  // Hidden body types can still occur in older saved rooms.
  if (avatar.body === "wide" || avatar.body === "pebble") return <LegacyAvatarMesh avatar={avatar} scale={scale} reactToChoices={reactToChoices} pointerLook={pointerLook} ready={ready} />;
  const normalized = avatar.body === "capsule" ? { ...avatar, body: "tall" as const } : avatar;
  return <group scale={scale}><group scale={avatarModelFit[normalized.body].scale}>
    <AvatarFigure avatar={normalized} color={shellColors[avatar.shell] ?? shellColors.chalk} pointerLook={pointerLook} reactToChoices={reactToChoices} ready={ready} />
  </group></group>;
}

function StageLight() {
  return <><ambientLight intensity={1.1} /><directionalLight position={[-2, 5, 6]} intensity={2.3} /><directionalLight position={[5, 2, -4]} intensity={0.7} /></>;
}

function PreviewCamera({ distance }: { distance: number }) {
  const { camera } = useThree();
  useLayoutEffect(() => {
    camera.position.set(0, 0, distance);
    camera.updateProjectionMatrix();
  }, [camera, distance]);
  return null;
}

function GroundedLobbyAvatar({ avatar, scale, ready }: { avatar: AvatarConfig; scale: number; ready: boolean }) {
  const footOffset = -avatarModelFit[avatar.body].floor;
  return <group position={[0, -0.96 + scale * footOffset, 0]}><AvatarMesh avatar={avatar} scale={scale} ready={ready} /></group>;
}

export function AvatarPreview({ avatar, label = "3D astronaut preview", cameraDistance = 4.9, scale = 1, verticalOffset = 0, interactive = false }: { avatar: AvatarConfig; label?: string; cameraDistance?: number; scale?: number; verticalOffset?: number; interactive?: boolean }) {
  const pointerLook = useRef(new Vector2());
  const fit = avatarModelFit[avatar.body];
  const orb = avatarModelFit.orb;
  const fitFactor = Math.max(1, (fit.top - fit.floor) / (orb.top - orb.floor));
  const fittedCameraDistance = cameraDistance * fitFactor;
  const floorY = fit.floor - 0.025;
  return <div className={`avatar-preview${interactive ? " avatar-preview--interactive" : ""}`} role="img" aria-label={label}
    onPointerMove={interactive ? (event) => {
      const bounds = event.currentTarget.getBoundingClientRect();
      pointerLook.current.set(Math.max(-1, Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2)), Math.max(-1, Math.min(1, (0.5 - (event.clientY - bounds.top) / bounds.height) * 2)));
    } : undefined}
    onPointerLeave={interactive ? () => pointerLook.current.set(0, 0) : undefined}>
    <Canvas dpr={[1, 1.6]} shadows camera={{ position: [0, 0, fittedCameraDistance], fov: 38 }} gl={{ alpha: true, antialias: true }}>
      <PreviewCamera distance={fittedCameraDistance} />
      <StageLight />
      <group position={[0, verticalOffset * fitFactor, 0]} scale={scale}>
        <ContactShadows position={[0, floorY, 0]} scale={1.16} opacity={0.13} blur={3.2} far={0.48} />
        <AvatarMesh avatar={avatar} reactToChoices pointerLook={interactive ? pointerLook : undefined} />
      </group>
    </Canvas>
  </div>;
}

export function LobbyStage({ members, selfId, capacity = 4, canAddBot = false, onAddBot }: { members: RoomMember[]; selfId: string | null; capacity?: number; canAddBot?: boolean; onAddBot?: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const [stageAspect, setStageAspect] = useState(1);
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const updateAspect = () => {
      const { width, height } = stage.getBoundingClientRect();
      if (width > 0 && height > 0) setStageAspect(width / height);
    };
    updateAspect();
    const observer = new ResizeObserver(updateAspect);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);
  const slots = Array.from({ length: Math.max(1, Math.min(5, capacity)) }, (_, index) => index);
  const cameraDepth = Math.hypot(2.2, 8.7);
  const halfViewWidth = cameraDepth * Math.tan(Math.PI / 10) * stageAspect;
  const outerSlotCount = Math.max(1, Math.ceil((slots.length - 1) / 2));
  // Keep the outer character silhouettes inside the camera frustum at narrow panel widths.
  const slotSpacing = Math.min(1.65, halfViewWidth * 0.74 / outerSlotCount);
  const groundDiscRadius = Math.min(0.79, slotSpacing * 0.42);
  const slotXs = slots.map((_, index) => index === 0 ? 0 : index % 2 === 1 ? -Math.ceil(index / 2) * slotSpacing : Math.ceil(index / 2) * slotSpacing);
  const orderedMembers = [...members].sort((left, right) => Number(right.id === selfId) - Number(left.id === selfId));
  const visualMembers = slots.map((_, index) => orderedMembers[index]);
  const stageDescription = visualMembers.map((member, index) => member
    ? `${member.name}, ${member.role || "Astronaut"}${member.isHost ? ", captain" : ""}${member.isBot ? ", bot" : ""}, ${member.ready ? "ready" : member.connected ? "waiting" : "offline"}${member.id === selfId ? ", you" : ""}`
    : `Open slot ${index + 1}`).join("; ");
  const avatarScale = slots.length > 3
    ? Math.min(0.78 * Math.min(1, Math.max(0.54, stageAspect / 1.5)), slotSpacing * 0.88 / 2.16)
    : 0.86;
  return <div ref={stageRef} className="lobby-stage" role="group" aria-label={`3D crew formation: ${stageDescription}`}>
    <Canvas dpr={[1, 1.5]} camera={{ position: [0, 2.2, 8.7], fov: 36 }} gl={{ alpha: true, antialias: true }}>
      <StageLight />
      {slotXs.map((x, index) => <group key={x} position={[x, 0.65, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.96, 0]}><circleGeometry args={[groundDiscRadius, 40]} /><meshBasicMaterial color={visualMembers[index]?.id === selfId ? "#5d8479" : "#323940"} transparent opacity={0.66} /></mesh>
        {visualMembers[index] && <GroundedLobbyAvatar avatar={visualMembers[index].avatar} scale={avatarScale} ready={visualMembers[index].ready} />}
      </group>)}
    </Canvas>
    {canAddBot && onAddBot && <div className="lobby-stage-add-buttons" aria-label="Add a crew bot">{slotXs.map((x, index) => visualMembers[index] ? null : <button key={x} type="button" aria-label={`Add bot to open slot ${index + 1}`} title="Add a randomized crew bot" style={{ left: `${50 + x * 50 / halfViewWidth}%` }} onClick={onAddBot}><Plus size={20} aria-hidden="true" /></button>)}</div>}
    <div className="lobby-stage-labels">{slotXs.map((x, index) => {
      const member = visualMembers[index];
      const status = member ? `${member.isBot ? "BOT · " : ""}${member.ready ? "READY" : member.connected ? "STANDBY" : "OFFLINE"}` : "OPEN SLOT";
      const role = member?.role || "Astronaut";
      const projectedLeft = 50 + x * 50 / halfViewWidth;
      const labelWidth = Math.min(20, slotSpacing * 50 / halfViewWidth * 0.92);
      return <div key={x} style={{ left: `${projectedLeft}%`, width: `${labelWidth}%` }}>
        <strong>{member?.name ?? `OPEN SLOT ${String(index + 1).padStart(2, "0")}`}</strong>
        <small>{member ? `${role}${member.isHost && role.toLowerCase() !== "captain" ? " · CAPTAIN" : ""}` : "AWAITING ASTRONAUT"}</small>
        <span className={`lobby-stage-status${member?.ready ? " is-ready" : ""}`}><i aria-hidden="true" />{status}</span>
      </div>;
    })}</div>
  </div>;
}
