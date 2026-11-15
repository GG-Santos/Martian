"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check, Copy } from "lucide-react";
import { Dish, Settle } from "@lucasmarkes/hairline/react";
import { ProjectShell } from "../../components/ProjectShell";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "../../components/ui/input-otp";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../components/ui/alert-dialog";
import { useRoom } from "../../features/session/RoomProvider";
import { AvatarPreview, LobbyStage } from "../../features/avatar/Avatar3D";
import { avatarBodies, avatarEyes, avatarFaces, avatarMouths, avatarShells, defaultAvatar, legacyAvatarBodies, legacyAvatarEyes, legacyAvatarMouths, type AvatarConfig, type AvatarEyes, type AvatarMouth } from "../../features/avatar/avatar-types";
import { avatarFeatures } from "../../features/avatar/avatar-expression";
import type { LocalPoint } from "../../features/mission/types";
import type { Quest } from "../../features/quests/quest-types";
import { createCrewBaseScenario, createCrewBaseScenarioSeed, type CrewSlopeGrid } from "../../features/crew/crew-hazard-scenario";
import { boardLocation, QuestSectorMap } from "../board/QuestSectorMap";
import { CrewMissionBoard } from "./CrewMissionBoard";
import { CrewBaseSetup } from "./CrewBaseSetup";
import { CrewHazardIcon } from "./CrewHazardIcon";
import { CrewStepActions } from "./CrewStepActions";
import "./crew.css";

const title = (value: string) => value[0].toUpperCase() + value.slice(1);
const crewSetupDraftKey = "earthapps:crew-setup-draft:v2";

function LobbyTerrainMap({ missionId, point, focusPoint, scenario }: { missionId: string | null; point: LocalPoint | null; focusPoint?: LocalPoint; scenario: ReturnType<typeof createCrewBaseScenario> }) {
  const location = boardLocation(missionId);
  const [slopeGrid, setSlopeGrid] = useState<CrewSlopeGrid>();
  useEffect(() => {
    if (location.regionId !== "jezero") { setSlopeGrid(undefined); return; }
    let active = true;
    fetch("/data/jezero/slope.u8").then(response => response.ok ? response.arrayBuffer() : Promise.reject(new Error("Slope layer unavailable")))
      .then(bytes => {
        if (active && bytes.byteLength === 257 * 257) setSlopeGrid({ width: 257, height: 257, cellSizeM: 8, westM: 0, northM: 2048, values: new Uint8Array(bytes) });
      }).catch(() => { if (active) setSlopeGrid(undefined); });
    return () => { active = false; };
  }, [location.regionId]);
  return <QuestSectorMap missionId={missionId} point={point} focusPoint={focusPoint} pinLabel="crew base" mapClassName="crew-base-sector-map" showSlopeOverlay={location.regionId === "jezero"} slopeGrid={slopeGrid} baseScenario={scenario} />;
}

type CrewSetupDraft = {
  mode: "create" | "join";
  step: "details" | "character" | "mission" | "base";
  crewName: string;
  name: string;
  role: string;
  code: string;
  avatar: AvatarConfig;
  missionId: string | null;
  missionAccepted?: boolean;
  base: LocalPoint | null;
  capacity: number;
  hazardSeed?: string;
};

function isCrewSetupDraft(value: unknown): value is CrewSetupDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<CrewSetupDraft>;
  const candidateAvatar = draft.avatar as Partial<AvatarConfig> | undefined;
  return (draft.mode === "create" || draft.mode === "join")
    && (draft.step === "details" || draft.step === "character" || draft.step === "mission" || draft.step === "base")
    && typeof draft.crewName === "string"
    && typeof draft.name === "string"
    && typeof draft.role === "string"
    && typeof draft.code === "string"
    && (draft.missionId === null || typeof draft.missionId === "string")
    && (draft.missionAccepted === undefined || typeof draft.missionAccepted === "boolean")
    && (draft.base === null || (typeof draft.base === "object" && Number.isFinite(draft.base.x) && Number.isFinite(draft.base.y) && draft.base.x >= 0 && draft.base.x <= 2048 && draft.base.y >= 0 && draft.base.y <= 2048))
    && Number.isInteger(draft.capacity) && Number(draft.capacity) >= 1 && Number(draft.capacity) <= 5
    && Boolean(candidateAvatar)
    && avatarShells.includes(candidateAvatar?.shell as AvatarConfig["shell"])
    && [...avatarBodies, ...legacyAvatarBodies].includes(candidateAvatar?.body as AvatarConfig["body"])
    && (!candidateAvatar?.eyes || [...avatarEyes, ...legacyAvatarEyes].includes(candidateAvatar.eyes))
    && (!candidateAvatar?.mouth || [...avatarMouths, ...legacyAvatarMouths].includes(candidateAvatar.mouth))
    && Boolean((candidateAvatar?.eyes && candidateAvatar?.mouth) || avatarFaces.includes(candidateAvatar?.face as NonNullable<AvatarConfig["face"]>));
}

function CrewLinework({ variant }: { variant: "assemble" | "join" }) {
  const figureRef = useRef<HTMLDivElement>(null);
  const dishRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const dish = dishRef.current;
    if (variant !== "join" || !dish || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const follow = (event: PointerEvent) => {
      if (event.target instanceof Node && dish.contains(event.target)) return;
      dish.dispatchEvent(new PointerEvent("pointermove", { clientX: event.clientX, clientY: event.clientY, pointerType: event.pointerType }));
    };
    window.addEventListener("pointermove", follow);
    return () => window.removeEventListener("pointermove", follow);
  }, [variant]);
  return <div ref={figureRef} className={`crew-linework crew-linework--${variant}`} aria-hidden="true">
    {variant === "assemble" ? <Settle theme="dark" intensity={0.45} /> : <Dish ref={dishRef} theme="dark" intensity={0.35} onRead={(value) => figureRef.current?.setAttribute("data-dish-read", value)} />}
  </div>;
}

type CrewSetupStep = "details" | "character" | "mission" | "base" | "lobby";

function CrewSetupTimeline({ current, mode, completed = [], available = [], onNavigate }: { current: CrewSetupStep; mode: "create" | "join"; completed?: CrewSetupStep[]; available?: CrewSetupStep[]; onNavigate: (step: CrewSetupStep) => void }) {
  const createSteps = [
    { id: "details", number: "01", label: "Details" },
    { id: "mission", number: "02", label: "Mission" },
    { id: "base", number: "03", label: "Base" },
    { id: "character", number: "04", label: "Character" },
    { id: "lobby", number: "05", label: "Lobby" },
  ] as const;
  const joinSteps = [createSteps[0], { id: "character", number: "02", label: "Character" }, { id: "lobby", number: "03", label: "Lobby" }] as const;
  const steps = mode === "create" ? createSteps : joinSteps;
  return <ol className={`crew-setup-timeline crew-setup-timeline--${mode}`} aria-label="Crew setup progress">{steps.map((item) => {
    const active = current === item.id;
    const done = !active && completed.includes(item.id);
    const canVisit = !active && available.includes(item.id);
    const stateLabel = active ? ", current step" : done ? `, completed${canVisit ? ", available" : ""}` : canVisit ? ", available" : ", not available yet";
    return <li key={item.id} aria-current={active ? "step" : undefined}><button type="button" disabled={!active && !canVisit} aria-label={`${item.label}${stateLabel}`} onClick={() => onNavigate(item.id)}><span aria-hidden="true">{done ? <Check size={13} /> : item.number}</span><span>{item.label}</span></button></li>;
  })}</ol>;
}

function AvatarChoices({ avatar, onChange, label, showIntro = false, showPreview = true }: { avatar: AvatarConfig; onChange: (value: AvatarConfig) => void; label: string; showIntro?: boolean; showPreview?: boolean }) {
  const features = avatarFeatures(avatar);
  const selectedBody = avatar.body === "capsule" ? "tall" : avatar.body;
  return <section className={`avatar-creator${showPreview ? "" : " avatar-creator--controls-only"}`} aria-label={label}>
    {showPreview && <div className="avatar-creator-head">{showIntro && <div><span className="eyebrow">CHARACTER CREATION</span><h2>Build your field character</h2><p>Shape a field companion for your crew. Your choices travel with you into the lobby and across the map.</p><span className="avatar-variation-count">{avatarShells.length * avatarBodies.length * avatarEyes.length * avatarMouths.length} FIELD COMBINATIONS</span></div>}<AvatarPreview avatar={avatar} /></div>}
    <div className="avatar-choice-group"><strong>Suit color</strong><div>{avatarShells.map((shell) => <button type="button" key={shell} className={`avatar-swatch ${shell}`} aria-label={`${title(shell)} suit`} aria-pressed={avatar.shell === shell} onClick={() => onChange({ ...avatar, shell })}><span>{title(shell)}</span></button>)}</div></div>
    <div className="avatar-choice-group"><strong>Shape</strong><div>{avatarBodies.map((body) => <Button type="button" key={body} data-avatar-choice="body" variant={selectedBody === body ? "secondary" : "outline"} aria-pressed={selectedBody === body} onClick={() => onChange({ ...avatar, body })}>{title(body)}</Button>)}</div></div>
    <div className="avatar-choice-group avatar-face-choice-group"><strong>Eyes</strong><div>{avatarEyes.map((eyes) => <Button type="button" className="avatar-feature-choice" key={eyes} data-avatar-choice="eyes" variant={features.eyes === eyes ? "secondary" : "outline"} aria-label={`${title(eyes)} eyes`} aria-pressed={features.eyes === eyes} onClick={() => onChange({ ...avatar, eyes })}>{title(eyes)}</Button>)}</div></div>
     <div className="avatar-choice-group avatar-face-choice-group"><strong>Mouth</strong><div>{avatarMouths.map((mouth) => { const label = title(mouth); return <Button type="button" className="avatar-feature-choice" key={mouth} data-avatar-choice="mouth" variant={features.mouth === mouth ? "secondary" : "outline"} aria-label={`${label} mouth`} aria-pressed={features.mouth === mouth} onClick={() => onChange({ ...avatar, mouth })}>{label}</Button>; })}</div></div>
  </section>;
}

export default function CrewPage() {
  const router = useRouter();
  const { snapshot, memberId, connection, error, roomCodeAvailability, create, join, checkRoomCode, send, leave, disband, clearError } = useRoom();
  useEffect(() => {
    if (snapshot?.status === "launched" && snapshot.members.some((member) => member.id === memberId)) router.replace("/scanner");
  }, [snapshot, memberId, router]);
  const [mode, setMode] = useState<"create" | "join" | null>(null);
  const [step, setStep] = useState<CrewSetupDraft["step"]>("details");
  const [crewName, setCrewName] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [code, setCode] = useState("");
  const [avatar, setAvatar] = useState<AvatarConfig>(defaultAvatar);
  const [missionId, setMissionId] = useState<string | null>(null);
  const [missionAccepted, setMissionAccepted] = useState(false);
  const [mission, setMission] = useState<Quest | null>(null);
  const [base, setBase] = useState<LocalPoint | null>(null);
  const [capacity, setCapacity] = useState(2);
  const [hazardSeed, setHazardSeed] = useState("");
  const [creating, setCreating] = useState(false);
  const [draftReady, setDraftReady] = useState(false);
  const [editingSetupStep, setEditingSetupStep] = useState<CrewSetupStep | null>(null);
  const [editingMemberProfileStep, setEditingMemberProfileStep] = useState<"details" | "character" | null>(null);
  const [joinCodeRejected, setJoinCodeRejected] = useState<{ code: string; reason: string } | null>(null);
  useEffect(() => {
    try {
      const saved = window.sessionStorage.getItem(crewSetupDraftKey);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (isCrewSetupDraft(parsed)) {
          setMode(parsed.mode);
          setStep(parsed.mode === "create" && parsed.step === "character" && !parsed.missionId ? "mission" : parsed.step);
          setCrewName(parsed.crewName.slice(0, 40));
          setName(parsed.name.slice(0, 10));
          setRole(parsed.mode === "create" ? parsed.role.slice(0, 14) || "Captain" : parsed.role.slice(0, 14));
          setCode(parsed.code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6));
          setAvatar({ ...parsed.avatar, ...avatarFeatures(parsed.avatar) });
          setMissionId(parsed.missionId);
          setMissionAccepted(parsed.missionAccepted ?? (parsed.mode === "create" && Boolean(parsed.missionId) && (parsed.step === "base" || parsed.step === "character")));
          setBase(parsed.base);
          setCapacity(parsed.capacity);
          setHazardSeed(parsed.hazardSeed ?? (parsed.mode === "create" ? createCrewBaseScenarioSeed() : ""));
        }
      }
    } catch {
      // Storage can be unavailable in private browsing; the form still works in memory.
    } finally {
      setDraftReady(true);
    }
  }, []);
  useEffect(() => {
    if (!draftReady) return;
    try {
      if (snapshot || mode === null) {
        window.sessionStorage.removeItem(crewSetupDraftKey);
        return;
      }
      const draft: CrewSetupDraft = { mode, step, crewName, name, role, code, avatar, missionId, missionAccepted, base, capacity, hazardSeed };
      window.sessionStorage.setItem(crewSetupDraftKey, JSON.stringify(draft));
    } catch {
      // Storage can be unavailable in private browsing; the form still works in memory.
    }
  }, [draftReady, snapshot, mode, step, crewName, name, role, code, avatar, missionId, missionAccepted, base, capacity, hazardSeed]);
  useEffect(() => {
    if (!missionId || mission || (step !== "base" && !(mode === "create" && step === "character"))) return;
    let active = true;
    fetch("/api/quests").then(response => response.ok ? response.json() as Promise<Quest[]> : Promise.reject(new Error("Could not restore the selected mission.")))
      .then(quests => { if (active) { const restored = quests.find(quest => quest.id === missionId && quest.status === "published"); if (restored) setMission(restored); else setStep("mission"); } })
      .catch(() => { if (active) setStep("mission"); });
    return () => { active = false; };
  }, [missionId, mission, step, mode]);
  useEffect(() => { if (error) setCreating(false); }, [error]);
  useEffect(() => {
    if (mode === "join" && step === "character" && (error === "Room is full" || error === "Room not found" || error === "Room already launched")) {
      setJoinCodeRejected({ code, reason: error });
      setStep("details");
      clearError();
    }
  }, [clearError, code, error, mode, step]);
  useEffect(() => {
    if (mode === "join" && code.length === 6 && connection === "online") checkRoomCode(code);
  }, [checkRoomCode, code, connection, mode]);
  const [copied, setCopied] = useState(false);
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);
  const me = snapshot?.members.find((member) => member.id === memberId);
  const isHost = Boolean(me?.isHost);
  const guestMembers = snapshot?.members.filter((member) => !member.isHost) ?? [];
  const notReadyGuests = guestMembers.filter((member) => !member.ready);
  const openCrewSlots = snapshot ? Math.max(0, snapshot.capacity - snapshot.members.length) : 0;
  const canLaunch = Boolean(snapshot?.base && snapshot?.missionId && openCrewSlots === 0 && notReadyGuests.length === 0);
  const currentCodeAvailability = roomCodeAvailability?.code === code ? roomCodeAvailability.status : null;
  const codeUnavailable = mode === "join" && code.length === 6 && (currentCodeAvailability === "full" || currentCodeAvailability === "invalid" || joinCodeRejected?.code === code);
  const lobbyLocation = boardLocation(snapshot?.missionId ?? "jezero");
  const editingSetup = Boolean(snapshot && isHost && snapshot.captainEditing && snapshot.status === "setup" && editingSetupStep);
  const editingMember = Boolean(snapshot && me && !isHost && editingMemberProfileStep && snapshot.status === "setup");
  const canContinueDetails = mode === "create" ? Boolean(crewName.trim() && name.trim()) : code.length === 6 && Boolean(name.trim()) && connection === "online" && currentCodeAvailability === "available";
  const completedSetupSteps: CrewSetupStep[] = mode === "create"
    ? [...(Boolean(crewName.trim() && name.trim()) ? ["details" as const] : []), ...(missionAccepted && missionId ? ["mission" as const] : []), ...(missionId && base ? ["base" as const] : [])]
    : [...(code.length === 6 && Boolean(name.trim()) ? ["details" as const] : [])];
  const availableSetupSteps: CrewSetupStep[] = mode === "create" && missionId && base ? ["character"] : [];
  const navigateSetup = (destination: CrewSetupStep) => {
    if (destination === "lobby" || (destination !== step && !completedSetupSteps.includes(destination) && !availableSetupSteps.includes(destination))) return;
    if (destination === "details" || destination === "character" || destination === "mission" || destination === "base") setStep(destination);
  };
  const sendRoom = (command: { type: "ready"; ready: boolean } | { type: "set-equipment"; equipment: string[] } | { type: "set-avatar"; avatar: AvatarConfig } | { type: "set-profile"; name: string; role?: string; avatar: AvatarConfig } | { type: "select-base"; point: { x: number; y: number } } | { type: "select-mission"; missionId: string } | { type: "captain-editing"; editing: boolean } | { type: "update-setup"; crewName: string; name: string; role?: string; avatar: AvatarConfig; mission: Quest; base: LocalPoint | null; capacity: number } | { type: "launch" }) => {
    if (snapshot) send({ ...command, code: snapshot.code, expectedRevision: snapshot.revision });
  };
  const beginHostSetup = (destination: CrewSetupStep = "character") => {
    if (!snapshot || !me?.isHost || snapshot.status !== "setup") return;
    setMode("create");
    setCrewName(snapshot.crewName);
    setName(me.name);
    setRole(me.role || "Captain");
    setAvatar({ ...me.avatar, ...avatarFeatures(me.avatar) });
    setMission(snapshot.mission);
    setMissionId(snapshot.mission?.id ?? snapshot.missionId);
    setMissionAccepted(Boolean(snapshot.mission));
    setBase(snapshot.base);
    setCapacity(snapshot.capacity);
    setHazardSeed(snapshot.baseScenario?.seed ?? `legacy-${snapshot.code}`);
    setEditingSetupStep(destination);
    sendRoom({ type: "captain-editing", editing: true });
  };
  const returnToLobby = () => {
    if (!snapshot || !me?.isHost || !mission || !crewName.trim() || !name.trim()) return;
    sendRoom({ type: "update-setup", crewName: crewName.trim(), name: name.trim(), role: role.trim() || undefined, avatar, mission, base, capacity });
    setMissionId(mission.id);
    setMissionAccepted(true);
    setEditingSetupStep(null);
  };
  const beginMemberProfileEdit = (destination: "details" | "character" = "character") => {
    if (!me || me.isHost || snapshot?.status !== "setup") return;
    setName(me.name);
    setRole(me.role ?? "");
    setAvatar({ ...me.avatar, ...avatarFeatures(me.avatar) });
    setEditingMemberProfileStep(destination);
  };
  const saveMemberProfile = () => {
    if (!me || !name.trim() || connection !== "online") return;
    sendRoom({ type: "set-profile", name: name.trim(), role: role.trim() || undefined, avatar });
    setEditingMemberProfileStep(null);
  };
  const navigateMemberProfile = (destination: CrewSetupStep) => {
    if (destination === "lobby") setEditingMemberProfileStep(null);
    else if (destination === "details" || destination === "character") setEditingMemberProfileStep(destination);
  };
  const editingTimeline = (current: CrewSetupStep) => <CrewSetupTimeline current={current} mode="create" completed={["details", "mission", "base", "character"]} available={["details", "mission", "base", "character", "lobby"]} onNavigate={destination => {
    if (destination === "lobby") returnToLobby();
    else if (destination !== current && ["details", "mission", "base", "character"].includes(destination)) setEditingSetupStep(destination);
  }} />;
  return <ProjectShell current="crew" crewExitAction={snapshot && memberId ? isHost ? "disband" : "leave" : undefined} onCrewExit={() => setExitConfirmationOpen(true)}><main className={editingMember ? `crew-page crew-page--step ${editingMemberProfileStep === "character" ? "crew-page--character" : "crew-page--setup"}` : !snapshot || editingSetup ? mode === null ? "crew-page crew-page--choice" : step === "character" || editingSetupStep === "character" ? "crew-page crew-page--step crew-page--character" : "crew-page crew-page--step crew-page--setup" : "crew-page"}>
    {error && !(mode === "join" && (error === "Room is full" || error === "Room not found" || error === "Room already launched")) && <div role="alert" className="crew-error">{error} <button type="button" onClick={clearError}>Dismiss</button></div>}
    {!snapshot && mode === null && <section className="crew-entry-options crew-entry-options--landing" aria-label="Choose how to enter a crew">
      <h1 className="sr-only">Choose a crew path</h1>
        <button type="button" aria-label="Create a crew" onClick={() => { setMode("create"); setRole(current => current.trim() || "Captain"); setStep("details"); setHazardSeed(createCrewBaseScenarioSeed()); }}><CrewLinework variant="assemble" /><span className="crew-card-index">START A NEW ROOM</span><span className="crew-card-copy"><strong>Create a crew</strong><small>Explore solo or invite up to three teammates.</small></span><span className="crew-card-action">Begin setup <ArrowRight size={18} aria-hidden="true" /></span></button>
        <button type="button" aria-label="Join a crew" onClick={() => { setMode("join"); setStep("details"); }}><CrewLinework variant="join" /><span className="crew-card-index">USE A ROOM CODE</span><span className="crew-card-copy"><strong>Join a crew</strong><small>Meet your teammates in an existing lobby.</small></span><span className="crew-card-action">Enter code <ArrowRight size={18} aria-hidden="true" /></span></button>
    </section>}
    {!snapshot && mode !== null && step === "details" && <section className="crew-details-step">
      <aside className="crew-details-aside"><div><span>CREW ASSEMBLY</span><h2>{mode === "create" ? "Make it Lagendary!" : "Your crew is waiting."}</h2><p>{mode === "create" ? "Name your crew, choose a mission and base, then build your character." : "Use the six-character room code your crew shared, then choose how you’ll appear in the field."}</p></div><CrewLinework variant={mode === "create" ? "assemble" : "join"} /><CrewSetupTimeline current="details" mode={mode} completed={completedSetupSteps} available={availableSetupSteps} onNavigate={navigateSetup} /></aside>
      <form className="crew-entry-form" onSubmit={(event) => { event.preventDefault(); setStep(mode === "join" ? "character" : missionAccepted && missionId && base ? "character" : missionAccepted && missionId ? "base" : "mission"); }}>
        <div className="crew-entry-form-head"><h1>{mode === "create" ? "Crew details" : "Join a crew"}</h1><Button type="button" variant="ghost" size="sm" className="crew-mode-switch" aria-label={mode === "create" ? "Switch to joining a crew" : "Switch to starting a crew"} onClick={() => { const nextMode = mode === "create" ? "join" : "create"; setMode(nextMode); if (nextMode === "create") setRole(current => current.trim() || "Captain"); }}>{mode === "create" ? "Enlist in a crew" : "Pioneer a crew"}</Button></div>
        <div className="crew-entry-fields">
          {mode === "create" && <label>Crew name<Input aria-label="Crew name" value={crewName} maxLength={40} onChange={(event) => setCrewName(event.target.value)} required /></label>}
          {mode === "join" && <label>Room code<InputOTP aria-label="Room code, six characters" aria-invalid={codeUnavailable ? "true" : undefined} aria-describedby={codeUnavailable ? "crew-room-code-invalid" : undefined} maxLength={6} value={code} pattern="^[A-Za-z0-9]*$" autoComplete="one-time-code" autoCapitalize="characters" inputMode="text" spellCheck={false} pasteTransformer={(value) => value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)} onChange={(value) => setCode(value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} required><InputOTPGroup aria-invalid={codeUnavailable ? "true" : undefined} className={`crew-room-code-group${codeUnavailable ? " crew-room-code-group--invalid" : ""}`}>{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} aria-invalid={codeUnavailable ? "true" : undefined} className={`crew-room-code-slot${codeUnavailable ? " crew-room-code-slot--invalid" : ""}`} />)}</InputOTPGroup></InputOTP>{codeUnavailable && <span className="sr-only" id="crew-room-code-invalid">{joinCodeRejected?.code === code ? joinCodeRejected.reason : currentCodeAvailability === "full" ? "This crew is full." : "This room code is invalid or unavailable."}</span>}</label>}
          <label>Your name<Input aria-label="Your name" value={name} maxLength={10} onChange={(event) => setName(event.target.value)} placeholder="Callsign or name" required /></label>
          <label className="crew-entry-fields-wide">Role (optional)<Input aria-label="Role (optional)" value={role} maxLength={14} onChange={(event) => setRole(event.target.value)} /></label>
        </div>
        <Button type="submit" disabled={!canContinueDetails}>{mode === "create" ? "Continue to mission" : "Continue to character"} <ArrowRight size={16} /></Button>
      </form>
    </section>}
    {snapshot && isHost && snapshot.captainEditing && editingSetupStep === "details" && <section className="crew-details-step crew-host-setup-step">
      <aside className="crew-details-aside"><div><span className="eyebrow">CREW ASSEMBLY / ROOM EDIT</span><h1>Update the expedition</h1><p>Your crew remains in this room while you revise the plan.</p></div><CrewLinework variant="assemble" />{editingTimeline("details")}</aside>
      <form className="crew-entry-form" onSubmit={event => { event.preventDefault(); setEditingSetupStep("mission"); }}>
        <div className="crew-entry-form-head"><h2>Crew details</h2></div>
        <div className="crew-entry-fields"><label>Crew name<Input aria-label="Crew name" value={crewName} maxLength={40} onChange={event => setCrewName(event.target.value)} required /></label><label>Your name<Input aria-label="Your name" value={name} maxLength={10} onChange={event => setName(event.target.value)} required /></label><label className="crew-entry-fields-wide">Occupation<Input aria-label="Occupation" value={role} maxLength={14} onChange={event => setRole(event.target.value)} /></label></div>
        <footer className="crew-character-step-actions"><span aria-hidden="true" /><Button type="button" onClick={() => setEditingSetupStep("mission")}>Choose mission <ArrowRight size={16} aria-hidden="true" /></Button></footer>
      </form>
    </section>}
    {snapshot && isHost && snapshot.captainEditing && editingSetupStep === "character" && <section className="crew-character-step crew-host-setup-step">
      <aside className="crew-character-aside"><div className="crew-character-intro"><span className="eyebrow">CREW ASSEMBLY / ROOM EDIT</span><h1>Build your character</h1><p>Update your suit and expression. The crew stays in this room.</p></div><AvatarPreview avatar={avatar} cameraDistance={8.5} scale={2.15} verticalOffset={0} interactive />{editingTimeline("character")}</aside>
      <div className="crew-character-controls"><AvatarChoices avatar={avatar} onChange={setAvatar} label="Customize your astronaut" showPreview={false} /><CrewStepActions backLabel="Back to base" continueLabel="Return to lobby" onBack={() => setEditingSetupStep("base")} onContinue={returnToLobby} disabled={!mission || !crewName.trim() || !name.trim()} /></div>
    </section>}
    {snapshot && isHost && snapshot.captainEditing && editingSetupStep === "mission" && <section className="crew-setup-frame crew-setup-frame--mission crew-host-setup-step">
      <CrewMissionBoard selectedId={missionId} timeline={editingTimeline("mission")} onSelect={quest => { setMissionId(quest.id); if (missionId !== quest.id) { setMission(quest); setBase(null); setMissionAccepted(false); setCapacity(Math.max(snapshot?.members.length ?? 1, quest.recommendedCrewSize)); } }} onAccept={quest => { setMission(quest); setMissionId(quest.id); setMissionAccepted(true); if (missionId !== quest.id) { setBase(null); setCapacity(Math.max(snapshot?.members.length ?? 1, quest.recommendedCrewSize)); } setEditingSetupStep("base"); }} onBack={() => setEditingSetupStep("details")} backLabel="Back to details" continueLabel="Choose base" />
    </section>}
    {snapshot && isHost && snapshot.captainEditing && editingSetupStep === "base" && (mission ? <CrewBaseSetup mission={mission} base={base} capacity={capacity} minimumCapacity={snapshot.members.length} hazardSeed={hazardSeed} onBaseChange={setBase} onCapacityChange={setCapacity} onBack={() => setEditingSetupStep("mission")} onContinue={() => setEditingSetupStep("character")} timeline={editingTimeline("base")} backLabel="Back to mission" continueLabel="Review character" /> : <section className="crew-setup-frame"><p className="crew-catalog-state" role="status">Choose a mission before editing the base.</p><Button variant="ghost" onClick={() => setEditingSetupStep("mission")}>Back to mission board</Button></section>)}
    {editingMember && me && editingMemberProfileStep === "details" && <section className="crew-details-step crew-member-details-step">
      <aside className="crew-details-aside"><div><span className="eyebrow">CREW ASSEMBLY / YOUR PROFILE</span><h1>Your details</h1><p>Update your name and occupation. Your room code stays locked.</p></div><CrewLinework variant="join" /><CrewSetupTimeline current="details" mode="join" completed={[]} available={["character", "lobby"]} onNavigate={navigateMemberProfile} /></aside>
      <form className="crew-entry-form" onSubmit={event => { event.preventDefault(); setEditingMemberProfileStep("character"); }}>
        <div className="crew-entry-form-head"><h2>Member details</h2><span>{snapshot?.crewName}</span></div>
        <div className="crew-entry-fields crew-member-profile-fields"><label>Room code<InputOTP aria-label="Room code, locked, six characters" value={snapshot?.code ?? ""} maxLength={6} disabled><InputOTPGroup className="crew-room-code-group">{Array.from({ length: 6 }, (_, index) => <InputOTPSlot key={index} index={index} className="crew-room-code-slot" />)}</InputOTPGroup></InputOTP></label><label>Your name<Input aria-label="Your name" value={name} maxLength={10} onChange={event => setName(event.target.value)} required /></label><label className="crew-entry-fields-wide">Occupation (optional)<Input aria-label="Occupation (optional)" value={role} maxLength={14} onChange={event => setRole(event.target.value)} /></label></div>
        <CrewStepActions backLabel="Back to lobby" continueLabel="Continue to character" onBack={() => setEditingMemberProfileStep(null)} onContinue={() => setEditingMemberProfileStep("character")} disabled={!name.trim()} />
      </form>
    </section>}
    {editingMember && me && editingMemberProfileStep === "character" && <section className="crew-character-step crew-member-profile-step">
      <aside className="crew-character-aside"><div className="crew-character-intro"><span className="eyebrow">CREW ASSEMBLY / YOUR PROFILE</span><h1>Your character</h1><p>Update your appearance. You’ll stay in this crew.</p></div><AvatarPreview avatar={avatar} cameraDistance={8.5} scale={2.15} verticalOffset={0} interactive /><CrewSetupTimeline current="character" mode="join" completed={["details"]} available={["details", "lobby"]} onNavigate={navigateMemberProfile} /></aside>
      <div className="crew-character-controls"><AvatarChoices avatar={avatar} onChange={setAvatar} label="Customize your astronaut" showPreview={false} /><CrewStepActions backLabel="Back to details" continueLabel="Save profile" onBack={() => setEditingMemberProfileStep("details")} onContinue={saveMemberProfile} disabled={!name.trim() || connection !== "online"} /></div>
    </section>}
    {!snapshot && mode !== null && step === "character" && <section className="crew-character-step">
      <aside className="crew-character-aside">
        <div className="crew-character-intro"><span className="eyebrow">CREW ASSEMBLY</span><h1>Build your character</h1><p>Choose a suit, shape, eyes, and mouth for the field.</p></div>
        <AvatarPreview avatar={avatar} cameraDistance={8.5} scale={2.15} verticalOffset={0} interactive />
        <CrewSetupTimeline current="character" mode={mode!} completed={completedSetupSteps} available={availableSetupSteps} onNavigate={navigateSetup} />
      </aside>
      <div className="crew-character-controls">
        <AvatarChoices avatar={avatar} onChange={setAvatar} label="Customize your astronaut" showPreview={false} />
        <CrewStepActions
          backLabel={mode === "create" ? "Back to base" : "Back to details"}
          continueLabel={mode === "create" ? creating ? "Creating room" : "Create room" : "Join crew"}
          onBack={() => setStep(mode === "create" ? "base" : "details")}
          onContinue={() => { if (mode === "create" && mission && base && connection === "online") { setCreating(true); create(crewName.trim(), name.trim(), role.trim() || undefined, avatar, mission, base, capacity, hazardSeed || "legacy-crew-scenario"); } else if (mode === "join") join(code.trim(), name.trim(), role.trim(), avatar); }}
          disabled={connection !== "online" || (mode === "create" && (!mission || !base))}
          busy={creating}
        />
      </div>
    </section>}
    {!snapshot && step === "mission" && mode === "create" && <section className="crew-setup-frame crew-setup-frame--mission">
      <CrewMissionBoard selectedId={missionId} timeline={<CrewSetupTimeline current="mission" mode="create" completed={completedSetupSteps} available={availableSetupSteps} onNavigate={navigateSetup} />} onSelect={quest => { setMissionId(quest.id); if (missionId !== quest.id) { setMission(quest); setBase(null); setMissionAccepted(false); setCapacity(quest.recommendedCrewSize); } }} onAccept={quest => { setMission(quest); setMissionId(quest.id); setMissionAccepted(true); setCapacity(current => missionId === quest.id ? current : quest.recommendedCrewSize); setStep("base"); }} onBack={() => setStep("details")} />
    </section>}
    {!snapshot && step === "base" && mode === "create" && (mission ? <CrewBaseSetup mission={mission} base={base} capacity={capacity} hazardSeed={hazardSeed || "legacy-crew-scenario"} onBaseChange={setBase} onCapacityChange={setCapacity} onBack={() => setStep("mission")} onContinue={() => setStep("character")} timeline={<CrewSetupTimeline current="base" mode="create" completed={completedSetupSteps} available={availableSetupSteps} onNavigate={navigateSetup} />} /> : <section className="crew-setup-frame"><p className="crew-catalog-state" role="status">Restoring your mission selection…</p><Button variant="ghost" onClick={() => setStep("mission")}>Back to mission board</Button></section>)}
    {snapshot && !editingSetup && !editingMember && (<div className="crew-lobby">
      <div className="crew-lobby-grid">
        <section className="crew-lobby-panel" aria-labelledby="crew-lobby-heading"><header className="crew-lobby-panel-header"><div><span className="eyebrow">CREW ROOM / {snapshot.code}</span><h1 id="crew-lobby-heading">{snapshot.crewName}</h1><p>{snapshot.status === "launched" ? "Expedition launched" : `${snapshot.members.filter(member => member.ready).length} / ${snapshot.members.length} ready`}</p></div><div className="crew-lobby-code"><span>ROOM CODE</span><strong data-testid="room-code">{snapshot.code}</strong><Button size="sm" variant="outline" aria-label="Copy room code" onClick={async () => { await navigator.clipboard.writeText(snapshot.code); setCopied(true); }}>{copied ? <Check size={15} /> : <Copy size={15} />}</Button></div></header>
          <LobbyStage members={snapshot.members} selfId={memberId} capacity={snapshot.capacity} />
          <div className="crew-lobby-panel-timeline"><CrewSetupTimeline current="lobby" mode={isHost ? "create" : "join"} completed={isHost ? ["details", "mission", "base", "character"] : ["details", "character"]} available={snapshot.status !== "setup" ? [] : isHost ? ["details", "mission", "base", "character"] : ["details", "character"]} onNavigate={destination => {
            if (destination === "lobby") return;
            if (isHost && snapshot.status === "setup") beginHostSetup(destination);
            else if (!isHost && snapshot.status === "setup" && (destination === "details" || destination === "character")) beginMemberProfileEdit(destination);
          }} /></div>

        </section>
        <aside className="crew-lobby-rail" aria-label="Expedition briefing"><section className="crew-lobby-mission"><span className="eyebrow">MISSION BRIEF</span><h2>{snapshot.mission?.title ?? "Mission details unavailable"}</h2>{snapshot.mission && <p className="crew-lobby-mission-description">{snapshot.mission.description}</p>}{snapshot.mission && <div className="crew-lobby-rail-fact"><strong>Objective</strong><p>{snapshot.mission.hypothesis}</p></div>}
            <div className="crew-lobby-context-layout">
              <section className="crew-lobby-map-wrap" aria-label="Crew base and mission map">
                <div className="crew-lobby-map"><LobbyTerrainMap missionId={snapshot.missionId} point={snapshot.base} focusPoint={snapshot.mission?.point} scenario={createCrewBaseScenario(snapshot.baseScenario?.seed ?? (`legacy-${snapshot.code}`), snapshot.baseScenario?.locationId ?? lobbyLocation.regionId)} /></div>
                {snapshot.mission && <div className="crew-lobby-rail-fact crew-lobby-map-hazards"><strong>Hazards for this crew</strong><div className="crew-lobby-hazards">{createCrewBaseScenario(snapshot.baseScenario?.seed ?? `legacy-${snapshot.code}`, snapshot.baseScenario?.locationId ?? lobbyLocation.regionId).zones.map(zone => <span className={`crew-base-hazard-chip crew-base-hazard-chip--${zone.kind}`} key={zone.id}><CrewHazardIcon kind={zone.kind} size={13} /><span>{zone.label}</span></span>)}{lobbyLocation.regionId === "jezero" && <span className="crew-base-hazard-chip crew-base-hazard-chip--slope" aria-label="Mapped slope terrain" title="Mapped slope terrain"><CrewHazardIcon kind="slope" size={13} /><span>Slope</span></span>}</div></div>}
              </section>
              <div className="crew-lobby-context-facts">
                {snapshot.mission && <div className="crew-lobby-rail-fact"><strong>Equipment</strong><p>{snapshot.mission.equipment.join(", ") || "No specific equipment listed"}</p></div>}
                {snapshot.mission && <div className="crew-lobby-rail-fact"><strong>Expected observations</strong><p>{snapshot.mission.expectedObservations}</p></div>}
                {snapshot.mission && <div className="crew-lobby-rail-fact"><strong>Completion criteria</strong><p>{snapshot.mission.completionCriteria}</p></div>}
                {snapshot.mission && snapshot.mission.hazards.length > 0 && <div className="crew-lobby-rail-fact"><strong>Mission note</strong><p>{snapshot.mission.hazards.join(", ")}</p></div>}
              </div>
            </div>
          </section>
          <footer className="crew-lobby-footer"><div className="crew-lobby-footer-back">{snapshot.status === "setup" && isHost && <Button variant="ghost" className="crew-lobby-back-link" onClick={() => beginHostSetup()} disabled={Boolean(snapshot.captainEditing)}><ArrowLeft size={16} /> Back to character</Button>}{snapshot.status === "setup" && memberId && !isHost && <Button variant="ghost" className="crew-lobby-back-link" onClick={() => beginMemberProfileEdit()}>Edit character</Button>}</div><div className="crew-lobby-footer-actions">{snapshot.status === "setup" && memberId && !isHost && <Button onClick={() => sendRoom({ type: "ready", ready: !me?.ready })} variant={me?.ready ? "outline" : "default"}>{me?.ready ? "Withdraw readiness" : "Ready"}</Button>}{snapshot.status === "setup" && isHost && <Button disabled={!canLaunch || Boolean(snapshot.captainEditing)} onClick={() => sendRoom({ type: "launch" })}>Launch expedition <ArrowRight size={16} /></Button>}{snapshot.status === "launched" && isHost && <Link className="crew-enter" href="/scanner">Enter exploration <ArrowRight size={16} /></Link>}</div></footer>
        </aside>
      </div>
    </div>)}
  </main>
    <AlertDialog open={exitConfirmationOpen} onOpenChange={setExitConfirmationOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{isHost ? "Disband this crew?" : "Leave this crew?"}</AlertDialogTitle>
          <AlertDialogDescription>{isHost
            ? "This will remove everyone and close the crew room. This action cannot be undone."
            : "You’ll be removed from this crew. You’ll need the room code to join again."}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" disabled={connection !== "online"} onClick={() => {
            if (isHost) disband();
            else { leave(); setMode(null); }
          }}>{isHost ? "Disband crew" : "Leave crew"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </ProjectShell>;
}
