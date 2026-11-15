import { randomBytes, randomUUID } from "node:crypto";
import { simulationDuration } from "../mission/simulation-duration.ts";
import { advanceSimulationClock, initialSimulationState, type SimulationState } from "../mission/simulation-clock.ts";
import type { LocalPoint } from "../mission/types";
import { canonicalCrewRegionId } from "../crew/crew-hazard-scenario.ts";
import type { ApplyResult, ClientCommand, ExpeditionPlan, MemberResources, RoomMember, RoomSnapshot } from "./protocol";
import { QuestStore } from "../quests/quest-store.ts";
import type { QuestCommand } from "../quests/quest-types";
import { avatarBodies, avatarEyes, avatarFaces, avatarMouths, avatarShells, defaultAvatar, legacyAvatarBodies, legacyAvatarEyes, legacyAvatarFaces, legacyAvatarMouths, type AvatarConfig } from "../avatar/avatar-types.ts";
import { avatarFeatures } from "../avatar/avatar-expression.ts";

const MIN_MEMBERS = 1;
const MAX_MEMBERS = 5;
const MAX_SPEED_MPS = 2;
const SECTOR_MAX_M = 2048;
/** Illustrative flat-distance resource burn in percentage points per actual meter moved. */
const OXYGEN_PER_M = 0.06;
const STAMINA_PER_M = 0.09;

type StoredMember = RoomMember & { token: string; lastMoveAt: number };
type StoredRoom = Omit<RoomSnapshot, "members"> & { members: StoredMember[] };
export type PersistedRooms = { rooms: StoredRoom[] };

export class ReconnectRejected extends Error {
  readonly code: "invalid-reconnect-token" | "room-not-found";

  constructor(code: ReconnectRejected["code"], message: string) {
    super(message);
    this.code = code;
  }
}

export class RoomStore {
  private rooms = new Map<string, StoredRoom>();
  private now: () => number;
  private randomId: () => string;

  constructor(options: { now?: () => number; randomId?: () => string; initialState?: PersistedRooms; resetConnectionsOnRestore?: boolean } = {}) {
    this.now = options.now ?? Date.now;
    this.randomId = options.randomId ?? (() => randomBytes(24).toString("hex"));
    for (const room of options.initialState?.rooms ?? []) {
      if (room && typeof room.code === "string" && Array.isArray(room.members)) {
        const restored = structuredClone(room);
        restored.crewName ??= `${restored.members[0]?.name ?? "Crew"}'s crew`;
        restored.mission ??= null;
        restored.baseScenario ??= { version: 1, locationId: restored.missionId ?? "jezero-hirise-048842-048908-v1", seed: "legacy-" + restored.code };
        restored.capacity = validCapacity(restored.capacity ?? 4);
        for (const member of restored.members) {
          if (options.resetConnectionsOnRestore !== false) member.connected = false;
          if (member.isBot) member.connected = true;
          member.isBot ??= false;
          member.avatar ??= { ...defaultAvatar };
          member.role = validRole(member.role, member.isHost ? "Captain" : "Crew");
        }
        restored.quests ??= [];
        restored.expeditionPlan ??= defaultExpeditionPlan(restored.mission?.id ?? restored.missionId);
        restored.simulation ??= { ...initialSimulationState };
        restored.resources ??= {};
        for (const member of restored.members) {
          const resources = restored.resources[member.id] ??= initialResources();
          resources.battery ??= 100;
        }
        this.rooms.set(room.code, restored);
      }
    }
  }

  getSnapshot(code: string): RoomSnapshot | null {
    const room = this.rooms.get(normalizeCode(code));
    return room ? snapshot(room) : null;
  }

  checkRoomCode(code: string): "available" | "full" | "invalid" {
    const room = this.rooms.get(normalizeCode(code));
    if (!room || room.status !== "setup") return "invalid";
    return room.members.length >= room.capacity ? "full" : "available";
  }

  exportState(): PersistedRooms {
    return { rooms: [...this.rooms.values()].map((room) => structuredClone(room)) };
  }

  /** Restore an exported checkpoint without resetting live connections or credentials. */
  restoreState(state: PersistedRooms): void {
    this.rooms = new Map(state.rooms.map((room) => [room.code, structuredClone(room)]));
  }

  disband(command: Extract<ClientCommand, { type: "disband" }>, actorToken?: string): { code: string } {
    const room = this.requireRoom(command.code);
    const member = room.members.find((candidate) => candidate.token === actorToken && typeof actorToken === "string" && actorToken.length > 0);
    if (!member) throw new Error("Invalid actor token");
    if (!member.isHost) throw new Error("Only the captain can disband the crew");
    if (command.expectedRevision !== room.revision) throw new Error("Stale room revision");
    this.rooms.delete(room.code);
    return { code: room.code };
  }

  apply(command: ClientCommand, actorToken?: string): ApplyResult {
    if (!command || typeof command !== "object" || typeof command.type !== "string") throw new Error("Invalid command");
    if (command.type === "create") {
      const name = validName(command.name);
      const crewName = validCrewName(command.crewName === undefined ? `${name}'s crew` : command.crewName);
      const role = validRole(command.role, "Captain");
      const mission = validMission(command.mission);
      const base = validPoint(command.base);
      const capacity = validCapacity(command.capacity);
      const baseScenario = validBaseScenario(command.baseScenario, mission.datasetId);
      let code: string;
      do { code = randomBytes(3).toString("hex").toUpperCase(); } while (this.rooms.has(code));
      const token = this.randomId();
      const member = this.makeMember(name, role, token, true, validAvatar(command.avatar));
      const room: StoredRoom = { code, crewName, revision: 1, status: "setup", members: [member], base, missionId: mission.datasetId, mission, capacity, baseScenario, positions: {}, resources: { [member.id]: initialResources() }, quests: [], activeQuestIds: [], expeditionPlan: defaultExpeditionPlan(mission.id), simulation: { ...initialSimulationState } };
      if (mission.datasetId === "jezero-hirise-048842-048908-v1") {
        const quests = new QuestStore(room.quests);
        quests.seedBuiltIns(room.code, mission.datasetId);
        room.quests = quests.list();
      }
      this.rooms.set(code, room);
      return result(room, member.id, token);
    }
    if (command.type === "join") {
      const room = this.requireRoom(command.code);
      if (room.status !== "setup") throw new Error("Room already launched");
      if (room.members.length >= room.capacity) throw new Error("Room is full");
      const name = validName(command.name);
      const role = validRole(command.role, "Crew");
      const token = this.randomId();
      const member = this.makeMember(name, role, token, false, validAvatar(command.avatar));
      room.members.push(member);
      room.resources[member.id] = initialResources();
      room.revision++;
      return result(room, member.id, token);
    }
    if (command.type === "reconnect") {
      const room = this.rooms.get(normalizeCode(command.code));
      if (!room) throw new ReconnectRejected("room-not-found", "Room not found");
      const member = room.members.find((candidate) => candidate.token === command.token && typeof command.token === "string" && command.token.length > 0);
      if (!member) throw new ReconnectRejected("invalid-reconnect-token", "Invalid reconnect token");
      member.token = this.randomId();
      if (!member.connected) { member.connected = true; room.revision++; }
      return result(room, member.id, member.token);
    }

    const room = this.requireRoom(command.code);
    const member = room.members.find((candidate) => candidate.token === actorToken && typeof actorToken === "string" && actorToken.length > 0);
    if (!member) throw new Error("Invalid actor token");
    if (command.expectedRevision !== room.revision) throw new Error("Stale room revision");
    switch (command.type) {
      case "leave": {
        if (member.isHost) room.captainEditing = false;
        room.members = room.members.filter((candidate) => candidate.id !== member.id);
        delete room.positions[member.id];
        delete room.resources[member.id];
        if (member.isHost && room.members.length > 0) room.members[0].isHost = true;
        if (room.members.length === 0) {
          this.rooms.delete(room.code);
          room.revision++;
          return result(room, member.id);
        }
        break;
      }
      case "add-bot": {
        requireHost(member);
        requireSetup(room);
        if (room.members.length >= room.capacity) throw new Error("Room is full");
        const avatar: AvatarConfig = {
          shell: pickRandom(avatarShells),
          body: pickRandom(avatarBodies),
          eyes: pickRandom(avatarEyes),
          mouth: pickRandom(avatarMouths),
        };
        const bot = this.makeMember(
          `${pickRandom(BOT_CALLSIGNS)}-${Math.floor(Math.random() * 90 + 10)}`,
          pickRandom(BOT_ROLES),
          this.randomId(),
          false,
          avatar,
        );
        bot.isBot = true;
        bot.ready = true;
        room.members.push(bot);
        room.resources[bot.id] = initialResources();
        break;
      }
      case "ready":
        if (room.status !== "setup") throw new Error("Readiness is closed after launch");
        if (typeof command.ready !== "boolean") throw new Error("Invalid ready value");
        member.ready = command.ready;
        break;
      case "set-equipment":
        requireSetup(room);
        room.resources[member.id].equipment = validEquipment(command.equipment);
        member.ready = false;
        break;
      case "set-avatar":
        requireSetup(room);
        member.avatar = validAvatar(command.avatar);
        member.ready = false;
        break;
      case "set-profile":
        requireSetup(room);
        if (member.isHost) throw new Error("Use the setup editor to update the captain profile");
        member.name = validName(command.name);
        member.role = validRole(command.role, "Crew");
        member.avatar = validAvatar(command.avatar);
        member.ready = false;
        break;
      case "select-base":
        requireHost(member);
        requireSetup(room);
        room.base = validPoint(command.point);
        for (const candidate of room.members) candidate.ready = false;
        break;
      case "set-expedition-plan":
        room.expeditionPlan = validExpeditionPlan(command.plan, room);
        break;
      case "set-simulation-scenario": {
        if (typeof command.startLs !== "number" || !Number.isFinite(command.startLs)
          || command.startLs < 0 || command.startLs >= 360) throw new Error("Invalid simulation season");
        const simulation = { ...initialSimulationState, scenarioId: command.scenarioId, startLs: command.startLs };
        if (simulation.scenarioId !== null && simulationDuration(room.missionId, simulation) === null) {
          throw new Error("Unavailable simulation scenario");
        }
        room.simulation = simulation;
        break;
      }
      case "advance-simulation":
        if (!Number.isFinite(command.deltaSol)) throw new Error("Invalid simulation step");
        room.simulation = advanceSimulationClock(room.simulation, { type: "step", deltaSol: command.deltaSol },
          simulationDuration(room.missionId, room.simulation) ?? 0);
        break;
      case "set-simulation-playing":
        if (typeof command.playing !== "boolean") throw new Error("Invalid simulation playback state");
        room.simulation = advanceSimulationClock(room.simulation, { type: command.playing ? "play" : "pause" },
          simulationDuration(room.missionId, room.simulation) ?? 0);
        break;
      case "reset-simulation":
        room.simulation = advanceSimulationClock(room.simulation, { type: "reset" },
          simulationDuration(room.missionId, room.simulation) ?? 0);
        break;
      case "select-mission":
        requireHost(member);
        requireSetup(room);
        if (!["jezero", "gale", "valles", "jezero-hirise-048842-048908-v1"].includes(command.missionId)) throw new Error("Unsupported mission ID");
        if (room.mission && command.missionId !== room.mission.datasetId) throw new Error("The accepted mission is locked when the room is created");
        if (!room.mission && room.missionId !== command.missionId) {
          room.expeditionPlan = defaultExpeditionPlan(command.missionId);
          room.simulation = { ...initialSimulationState };
        }
        room.missionId = command.missionId;
        if (command.missionId === "jezero" || command.missionId === "jezero-hirise-048842-048908-v1") {
          const quests = new QuestStore(room.quests);
          quests.seedBuiltIns(room.code, "jezero-hirise-048842-048908-v1");
          room.quests = quests.list();
        }
        for (const candidate of room.members) candidate.ready = false;
        break;
      case "captain-editing":
        requireHost(member);
        requireSetup(room);
        if (typeof command.editing !== "boolean") throw new Error("Invalid captain editing state");
        room.captainEditing = command.editing;
        break;
      case "update-setup": {
        requireHost(member);
        requireSetup(room);
        const crewName = validCrewName(command.crewName);
        const name = validName(command.name);
        const role = validRole(command.role, "Captain");
        const avatar = validAvatar(command.avatar);
        const mission = validMission(command.mission);
        const base = command.base === null ? null : validPoint(command.base);
        const capacity = validCapacity(command.capacity);
        if (capacity < room.members.length) throw new Error("Room capacity cannot be lower than the current crew size");
        const setupChanged = room.crewName !== crewName || room.missionId !== mission.datasetId
          || JSON.stringify(room.base) !== JSON.stringify(base) || room.capacity !== capacity;
        room.crewName = crewName;
        member.name = name;
        member.role = role;
        member.avatar = avatar;
        if (room.mission?.id !== mission.id || room.missionId !== mission.datasetId) {
          room.expeditionPlan = defaultExpeditionPlan(mission.id);
          if (room.missionId !== mission.datasetId) room.simulation = { ...initialSimulationState };
        }
        room.mission = mission;
        room.missionId = mission.datasetId;
        room.base = base;
        room.capacity = capacity;
        room.baseScenario = { version: 1, locationId: canonicalCrewRegionId(mission.datasetId), seed: room.baseScenario?.seed ?? `legacy-${room.code}` };
        room.captainEditing = false;
        if (mission.datasetId === "jezero-hirise-048842-048908-v1") {
          const quests = new QuestStore(room.quests);
          quests.seedBuiltIns(room.code, mission.datasetId);
          room.quests = quests.list();
        }
        if (setupChanged) for (const candidate of room.members) if (!candidate.isHost) candidate.ready = false;
        break;
      }
      case "launch":
        requireHost(member);
        requireSetup(room);
        if (!room.base || !room.missionId) throw new Error("Choose a base and mission before launch");
        if (!room.members.filter((candidate) => !candidate.isHost).every((candidate) => candidate.ready)) throw new Error("Every crew member must be ready");
        room.status = "launched";
        for (const candidate of room.members) {
          room.positions[candidate.id] = { ...room.base };
          room.resources[candidate.id].oxygen = 100;
          room.resources[candidate.id].stamina = 100;
          candidate.lastMoveAt = this.now();
        }
        break;
      case "move": {
        if (room.status !== "launched") throw new Error("Cannot move before launch");
        const requested = finitePoint(command.point);
        const point = { x: clamp(requested.x), y: clamp(requested.y) };
        const prior = room.positions[member.id];
        const elapsedSec = Math.max(0, (this.now() - member.lastMoveAt) / 1000);
        const distance = Math.hypot(point.x - prior.x, point.y - prior.y);
        const resources = room.resources[member.id];
        const allowedDistance = Math.min(elapsedSec * MAX_SPEED_MPS, resources.oxygen / OXYGEN_PER_M, resources.stamina / STAMINA_PER_M);
        const fraction = distance > 0 ? Math.min(1, allowedDistance / distance) : 0;
        const moved = {
          x: prior.x + (point.x - prior.x) * fraction,
          y: prior.y + (point.y - prior.y) * fraction,
        };
        const actualDistance = Math.hypot(moved.x - prior.x, moved.y - prior.y);
        resources.oxygen = Math.max(0, round(resources.oxygen - actualDistance * OXYGEN_PER_M));
        resources.stamina = Math.max(0, round(resources.stamina - actualDistance * STAMINA_PER_M));
        room.positions[member.id] = moved;
        if (member.isHost) {
          for (const bot of room.members.filter((candidate) => candidate.isBot)) {
            room.positions[bot.id] = { ...moved };
            room.resources[bot.id].oxygen = resources.oxygen;
            room.resources[bot.id].stamina = resources.stamina;
            bot.lastMoveAt = this.now();
          }
        }
        member.lastMoveAt = this.now();
        break;
      }
      case "quest-create":
      case "quest-publish":
      case "quest-accept":
      case "quest-start":
      case "quest-complete":
      case "quest-cancel":
      case "quest-fail": {
        const quests = new QuestStore(room.quests);
        quests.apply(command as QuestCommand, {
          roomCode: room.code,
          datasetId: room.missionId === "jezero" ? "jezero-hirise-048842-048908-v1" : room.missionId ?? "jezero-hirise-048842-048908-v1",
          actorId: member.id,
          memberIds: room.members.map((candidate) => candidate.id),
          isHost: member.isHost,
        });
        room.quests = quests.list();
        room.activeQuestIds = room.quests.filter((quest) => quest.status === "accepted" || quest.status === "in-progress").map((quest) => quest.id);
        const available = availableObjectiveIds(room);
        room.expeditionPlan.optionalObjectiveIds = room.expeditionPlan.optionalObjectiveIds.filter((id) => available.has(id));
        break;
      }
      default: throw new Error("Invalid command");
    }
    room.revision++;
    return result(room, member.id);
  }

  disconnect(token: string): ApplyResult | null {
    for (const room of this.rooms.values()) {
      const member = room.members.find((candidate) => candidate.token === token);
      if (!member || !member.connected) continue;
      member.connected = false;
      if (member.isHost) room.captainEditing = false;
      room.revision++;
      return result(room, member.id);
    }
    return null;
  }

  private requireRoom(code: string): StoredRoom {
    const room = this.rooms.get(normalizeCode(code));
    if (!room) throw new Error("Room not found");
    return room;
  }

  private makeMember(name: string, role: string | null, token: string, isHost: boolean, avatar: AvatarConfig): StoredMember {
    return { id: randomUUID(), name, role, avatar, isHost, ready: false, connected: true, joinedAt: this.now(), token, lastMoveAt: this.now() };
  }
}

function normalizeCode(code: string): string { return typeof code === "string" ? code.trim().toUpperCase() : ""; }
const BOT_CALLSIGNS = ["Astra", "Pioneer", "Comet", "Nova", "Orbit", "Scout", "Sol", "Cosmo"];
const BOT_ROLES = ["Geologist", "Navigator", "Engineer", "Field Scientist", "Medic", "Cartographer"];
function pickRandom<T>(items: readonly T[]): T { return items[Math.floor(Math.random() * items.length)]; }
function validName(name: string): string {
  if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 32) throw new Error("Invalid member name");
  return name.trim();
}
function validCrewName(name: unknown): string {
  if (typeof name !== "string" || name.trim().length < 1 || name.trim().length > 40) throw new Error("Invalid crew name");
  return name.trim();
}
function validRole(role: unknown, fallback: "Captain" | "Crew"): string {
  if (role == null || (typeof role === "string" && role.trim() === "")) return fallback;
  if (typeof role !== "string" || role.trim().length > 32) throw new Error("Invalid member role");
  return role.trim();
}
function validAvatar(value: unknown): AvatarConfig {
  if (value === undefined) return { ...defaultAvatar };
  if (!value || typeof value !== "object") throw new Error("Invalid avatar");
  const avatar = value as Partial<AvatarConfig>;
  const shell = avatarShells.includes(avatar.shell as AvatarConfig["shell"]) ? avatar.shell! : defaultAvatar.shell;
  const body = [...avatarBodies, ...legacyAvatarBodies].includes(avatar.body as AvatarConfig["body"]) ? avatar.body! : defaultAvatar.body;
  const face = avatar.face && [...avatarFaces, ...legacyAvatarFaces].includes(avatar.face) ? avatar.face : undefined;
  const eyes = avatar.eyes && [...avatarEyes, ...legacyAvatarEyes].includes(avatar.eyes) ? avatar.eyes : undefined;
  const mouth = avatar.mouth && [...avatarMouths, ...legacyAvatarMouths].includes(avatar.mouth) ? avatar.mouth : undefined;
  // Normalize stale or partial saved configs the same way the preview does,
  // instead of rejecting room creation because an older option was removed.
  return { shell, body, ...avatarFeatures({ shell, body, face, eyes, mouth }) };
}
function validPoint(point: LocalPoint): LocalPoint {
  finitePoint(point);
  if (point.x < 0 || point.x > SECTOR_MAX_M || point.y < 0 || point.y > SECTOR_MAX_M) throw new Error("Point outside sector bounds");
  return { x: point.x, y: point.y };
}
function validBaseScenario(value: unknown, locationId: string): NonNullable<RoomSnapshot["baseScenario"]> {
  if (!value || typeof value !== "object") throw new Error("Missing crew hazard scenario");
  const candidate = value as Partial<NonNullable<RoomSnapshot["baseScenario"]>>;
  if (candidate.version !== 1 || typeof candidate.locationId !== "string" || canonicalCrewRegionId(candidate.locationId) !== canonicalCrewRegionId(locationId) || typeof candidate.seed !== "string" || candidate.seed.length < 1 || candidate.seed.length > 128) throw new Error("Invalid crew hazard scenario");
  return { version: 1, locationId: canonicalCrewRegionId(locationId), seed: candidate.seed };
}
function validCapacity(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < MIN_MEMBERS || Number(value) > MAX_MEMBERS) throw new Error("Room capacity must be an integer from 1 to 5");
  return Number(value);
}
function validMission(value: unknown): NonNullable<RoomSnapshot["mission"]> {
  if (!value || typeof value !== "object") throw new Error("Choose a mission before creating the room");
  const mission = value as Partial<NonNullable<RoomSnapshot["mission"]>>;
  if (typeof mission.id !== "string" || !mission.id.trim() || typeof mission.title !== "string" || !mission.title.trim()
    || mission.status !== "published" || typeof mission.datasetId !== "string"
    || !["jezero-hirise-048842-048908-v1"].includes(mission.datasetId)
    || typeof mission.description !== "string" || typeof mission.hypothesis !== "string"
    || typeof mission.expectedObservations !== "string" || typeof mission.completionCriteria !== "string"
    || typeof mission.provenance !== "string" || !Array.isArray(mission.equipment) || !Array.isArray(mission.hazards)
    || !Number.isFinite(mission.durationMin) || !["low", "moderate", "high"].includes(mission.difficulty ?? "")
    || !Number.isInteger(mission.recommendedCrewSize) || Number(mission.recommendedCrewSize) < 1 || Number(mission.recommendedCrewSize) > MAX_MEMBERS) {
    throw new Error("The selected mission is invalid or unavailable");
  }
  validPoint(mission.point as LocalPoint);
  if (mission.source !== "built-in" && mission.source !== "crew") throw new Error("The selected mission source is invalid");
  return structuredClone(mission as NonNullable<RoomSnapshot["mission"]>);
}
function finitePoint(point: LocalPoint): LocalPoint {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new Error("Invalid point");
  return point;
}
function clamp(value: number): number { return Math.min(SECTOR_MAX_M, Math.max(0, value)); }
function round(value: number): number { return Math.round(value * 1000) / 1000; }
function initialResources(): MemberResources { return { oxygen: 100, battery: 100, stamina: 100, equipment: [] }; }
function validEquipment(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 12 || !value.every((item) => typeof item === "string" && /^[a-z][a-z0-9-]{0,31}$/.test(item)) || new Set(value).size !== value.length) throw new Error("Invalid equipment");
  return [...value];
}
function defaultExpeditionPlan(primaryObjectiveId: string | null): ExpeditionPlan {
  return { primaryObjectiveId: primaryObjectiveId ?? "", optionalObjectiveIds: [], routePreference: "efficient" };
}
function availableObjectiveIds(room: StoredRoom): Set<string> {
  const datasetId = room.mission?.datasetId ?? (room.missionId === "jezero" ? "jezero-hirise-048842-048908-v1" : room.missionId);
  return new Set(room.quests.filter((quest) =>
    quest.roomCode === room.code && quest.datasetId === datasetId
    && (quest.status === "published" || quest.status === "accepted"),
  ).map((quest) => quest.id));
}
function validExpeditionPlan(value: unknown, room: StoredRoom): ExpeditionPlan {
  if (!value || typeof value !== "object") throw new Error("Invalid expedition plan");
  const plan = value as Partial<ExpeditionPlan>;
  const primaryObjectiveId = room.mission?.id;
  if (!primaryObjectiveId || plan.primaryObjectiveId !== primaryObjectiveId) throw new Error("Invalid primary objective");
  const { optionalObjectiveIds, routePreference } = plan;
  if (routePreference !== "efficient" && routePreference !== "lower-exposure") throw new Error("Invalid route preference");
  if (!Array.isArray(optionalObjectiveIds)) throw new Error("Invalid optional objectives");
  const available = availableObjectiveIds(room);
  if (new Set(optionalObjectiveIds).size !== optionalObjectiveIds.length) throw new Error("Duplicate optional objective");
  for (const id of optionalObjectiveIds) {
    if (id === primaryObjectiveId || !available.has(id)) throw new Error("Unavailable optional objective");
  }
  return { primaryObjectiveId, optionalObjectiveIds: [...optionalObjectiveIds], routePreference };
}
function requireHost(member: StoredMember) { if (!member.isHost) throw new Error("Only the host can change mission setup"); }
function requireSetup(room: StoredRoom) { if (room.status !== "setup") throw new Error("Room already launched"); }
function snapshot(room: StoredRoom): RoomSnapshot {
  return {
    code: room.code, crewName: room.crewName, captainEditing: room.captainEditing ?? false, revision: room.revision, status: room.status,
    members: room.members.map(({ id, name, role, avatar, isHost, ready, connected, joinedAt, isBot }) => ({ id, name, role, avatar, isHost, ready, connected, joinedAt, isBot: Boolean(isBot) })),
    base: room.base ? { ...room.base } : null, missionId: room.missionId,
    mission: room.mission ? structuredClone(room.mission) : null, capacity: room.capacity,
    baseScenario: room.baseScenario ? { ...room.baseScenario } : undefined,
    positions: structuredClone(room.positions), activeQuestIds: [...room.activeQuestIds],
    expeditionPlan: structuredClone(room.expeditionPlan),
    simulation: { ...room.simulation },
    resources: structuredClone(room.resources),
    quests: structuredClone(room.quests),
  };
}
function result(room: StoredRoom, memberId: string, token?: string): ApplyResult {
  const current = snapshot(room);
  return { snapshot: current, events: [{ type: "snapshot", snapshot: current }], memberId, ...(token ? { token } : {}) };
}
