import type { SimulationState } from "../mission/simulation-clock";
import type { LocalPoint } from "../mission/types";
import type { Quest, QuestCommand } from "../quests/quest-types";
import type { AvatarConfig } from "../avatar/avatar-types";

export type { SimulationState } from "../mission/simulation-clock";

export type RoomMission = Quest;
export type RoomCodeAvailability = "checking" | "available" | "full" | "invalid";

export type RoomMember = {
  id: string;
  name: string;
  role: string | null;
  isHost: boolean;
  ready: boolean;
  connected: boolean;
  joinedAt: number;
  avatar: AvatarConfig;
};

export type MemberResources = {
  oxygen: number;
  battery: number;
  stamina: number;
  equipment: string[];
};

export type ExpeditionPlan = {
  primaryObjectiveId: string;
  optionalObjectiveIds: string[];
  routePreference: "efficient" | "lower-exposure";
};

export type RoomSnapshot = {
  baseScenario?: { version: 1; locationId: string; seed: string };
  captainEditing?: boolean;
  code: string;
  crewName: string;
  revision: number;
  status: "setup" | "launched";
  members: RoomMember[];
  base: LocalPoint | null;
  missionId: string | null;
  mission: RoomMission | null;
  capacity: number;
  positions: Record<string, LocalPoint>;
  resources: Record<string, MemberResources>;
  quests: Quest[];
  activeQuestIds: string[];
  expeditionPlan: ExpeditionPlan;
  simulation: SimulationState;
};

export type ClientCommand =
  | { type: "create"; name: string; crewName?: string; role?: string; avatar?: AvatarConfig; mission: RoomMission; base: LocalPoint; capacity: number; baseScenario: { version: 1; locationId: string; seed: string } }
  | { type: "join"; code: string; name: string; role?: string; avatar?: AvatarConfig }
  | { type: "reconnect"; code: string; token: string }
  | { type: "leave"; code: string; expectedRevision: number }
  | { type: "disband"; code: string; expectedRevision: number }
  | { type: "ready"; code: string; expectedRevision: number; ready: boolean }
  | { type: "set-equipment"; code: string; expectedRevision: number; equipment: string[] }
  | { type: "set-avatar"; code: string; expectedRevision: number; avatar: AvatarConfig }
  | { type: "set-profile"; code: string; expectedRevision: number; name: string; role?: string; avatar: AvatarConfig }
  | { type: "select-base"; code: string; expectedRevision: number; point: LocalPoint }
  | { type: "set-expedition-plan"; code: string; expectedRevision: number; plan: ExpeditionPlan }
  | { type: "set-simulation-scenario"; code: string; expectedRevision: number; scenarioId: string | null; startLs: number }
  | { type: "advance-simulation"; code: string; expectedRevision: number; deltaSol: number }
  | { type: "set-simulation-playing"; code: string; expectedRevision: number; playing: boolean }
  | { type: "reset-simulation"; code: string; expectedRevision: number }
  | { type: "select-mission"; code: string; expectedRevision: number; missionId: string }
  | { type: "captain-editing"; code: string; expectedRevision: number; editing: boolean }
  | { type: "update-setup"; code: string; expectedRevision: number; crewName: string; name: string; role?: string; avatar: AvatarConfig; mission: RoomMission; base: LocalPoint | null; capacity: number }
  | { type: "launch"; code: string; expectedRevision: number }
  | { type: "move"; code: string; expectedRevision: number; point: LocalPoint }
  | (QuestCommand & { code: string; expectedRevision: number });

export type RoomEvent = { type: "snapshot"; snapshot: RoomSnapshot };
export type ServerMessage =
  | { type: "accepted"; snapshot: RoomSnapshot; memberId: string; token?: string }
  | { type: "room-check"; code: string; status: Exclude<RoomCodeAvailability, "checking"> }
  | { type: "disbanded"; code: string }
  | RoomEvent
  | { type: "error"; code: string; message: string };

export type ApplyResult = {
  snapshot: RoomSnapshot;
  events: RoomEvent[];
  memberId?: string;
  token?: string;
};
