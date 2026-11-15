import { describe, expect, it } from "vitest";
import { RoomStore } from "./room-store";
import { LocalRoomCommandRepository, RoomService } from "./room-service";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { loadRooms, saveRooms } from "./file-store";
import type { Quest, QuestInput } from "../quests/quest-types";

const questInput: QuestInput = {
  title: "Inspect the ridge", description: "Compare two exposed layers", hypothesis: "Upper layer is finer",
  point: { x: 500, y: 600 }, equipment: ["camera"], recommendedCrewSize: 2,
  durationMin: 45, difficulty: "moderate", hazards: ["slope"],
  expectedObservations: "Layer sketches", completionCriteria: "Record a comparison",
};

const acceptedMission: Quest = {
  ...questInput, id: "mission-test", roomCode: "TEST", datasetId: "jezero-hirise-048842-048908-v1",
  source: "built-in", provenance: "Bundled hypothetical objective for the archival Jezero HiRISE sector; not a verified field site.",
  status: "published", createdBy: null, assignedMemberIds: [], completion: null, resolution: null,
};
const createCommand = (name: string, crewName?: string) => ({
  type: "create" as const, name, crewName, mission: acceptedMission, base: { x: 500, y: 600 }, capacity: 4,
  baseScenario: { version: 1 as const, locationId: "jezero", seed: "fixture-crew" },
});

function fixture() {
  let now = 1_000;
  let serial = 0;
  const store = new RoomStore({ now: () => now, randomId: () => `secret-${++serial}` });
  const create = store.apply(createCommand("Ari"));
  const code = create.snapshot.code;
  const hostToken = create.token!;
  const join = (name: string) => store.apply({ type: "join", code, name });
  return { store, code, hostToken, join, advance: (ms: number) => { now += ms; } };
}

describe("LocalRoomCommandRepository transactions", () => {
  it("preserves the saved reconnect token when persistence fails so the same token can retry", async () => {
    const { store, code, hostToken } = fixture();
    store.disconnect(hostToken);
    const before = store.exportState();
    let fail = true;
    const service = new RoomService(new LocalRoomCommandRepository(store, async () => {
      if (fail) throw new Error("disk unavailable");
    }));
    const connection = { actorToken: null, roomCode: null };
    const command = { type: "reconnect", code, token: hostToken };

    await expect(service.handle(command, connection)).rejects.toThrow("disk unavailable");
    expect(store.exportState()).toEqual(before);
    expect(connection).toEqual({ actorToken: null, roomCode: null });

    fail = false;
    const retried = await service.handle(command, connection);
    expect(retried).toMatchObject({ type: "accepted", memberId: before.rooms[0].members[0].id });
    expect(connection.actorToken).toBeTruthy();
    expect(connection.actorToken).not.toBe(hostToken);
    expect(store.getSnapshot(code)?.members).toHaveLength(1);
    expect(store.getSnapshot(code)?.members[0].connected).toBe(true);
  });

  it.each(["ready", "disband", "disconnect", "create", "join", "leave"] as const)(
    "rolls back a failed %s write and permits retry against the original state",
    async (kind) => {
      const { store, code, hostToken } = fixture();
      const before = store.exportState();
      let fail = true;
      let durable = before;
      const repository = new LocalRoomCommandRepository(store, async () => {
        if (fail) throw new Error("disk unavailable");
        durable = store.exportState();
      });
      const operations = {
        ready: () => repository.apply({ type: "ready", code, expectedRevision: 1, ready: true }, hostToken),
        disband: () => repository.disband({ type: "disband", code, expectedRevision: 1 }, hostToken),
        disconnect: () => repository.disconnect(hostToken),
        create: () => repository.apply(createCommand("Bea")),
        join: () => repository.apply({ type: "join", code, name: "Bea" }),
        leave: () => repository.apply({ type: "leave", code, expectedRevision: 1 }, hostToken),
      };

      await expect(operations[kind]()).rejects.toThrow("disk unavailable");
      expect(store.exportState()).toEqual(before);
      expect(store.exportState()).toEqual(durable);

      fail = false;
      await operations[kind]();
      expect(store.exportState()).not.toEqual(before);
      expect(store.exportState()).toEqual(durable);
    },
  );

  it("serializes mutations so rollback cannot erase a concurrent successful join", async () => {
    const { store, code, hostToken } = fixture();
    let rejectWrite!: (reason: Error) => void;
    const blockedWrite = new Promise<void>((_resolve, reject) => { rejectWrite = reject; });
    let started!: () => void;
    const writing = new Promise<void>((resolve) => { started = resolve; });
    let first = true;
    let durable = store.exportState();
    const repository = new LocalRoomCommandRepository(store, async () => {
      if (first) {
        first = false;
        started();
        await blockedWrite;
      }
      durable = store.exportState();
    });
    const failed = expect(repository.apply({ type: "ready", code, expectedRevision: 1, ready: true }, hostToken))
      .rejects.toThrow("disk unavailable");
    await writing;
    const joining = repository.apply({ type: "join", code, name: "Bea" });
    const membersWhileWriting = store.getSnapshot(code)?.members.length;
    rejectWrite(new Error("disk unavailable"));

    await failed;
    const joined = await joining;
    expect(membersWhileWriting).toBe(1);
    expect(joined.snapshot).toMatchObject({ revision: 2, members: [{ name: "Ari", ready: false }, { name: "Bea" }] });
    expect(store.exportState()).toEqual(durable);
    await expect(repository.checkRoomCode(code)).resolves.toBe("available");
  });
});

describe("RoomStore", () => {
  it("identifies terminal reconnect failures in the room protocol", async () => {
    const { store, code, hostToken } = fixture();
    const service = new RoomService(new LocalRoomCommandRepository(store, async () => {}));
    const session = { actorToken: null, roomCode: null };

    await expect(service.handle({ type: "reconnect", code, token: "forged" }, session))
      .resolves.toMatchObject({ type: "error", code: "invalid-reconnect-token" });
    await expect(service.handle({ type: "reconnect", code: "ABSENT", token: hostToken }, session))
      .resolves.toMatchObject({ type: "error", code: "room-not-found" });
    await expect(service.handle({ type: "reconnect", code, token: hostToken }, session))
      .resolves.toMatchObject({ type: "accepted" });
  });
  it("keeps a crew name in snapshots and persisted rooms", () => {
    const store = new RoomStore();
    const created = store.apply(createCommand("Ari", "Delta Survey"));
    expect(created.snapshot.crewName).toBe("Delta Survey");
    expect(new RoomStore({ initialState: store.exportState() }).getSnapshot(created.snapshot.code)?.crewName).toBe("Delta Survey");
    const legacyState = store.exportState();
    delete (legacyState.rooms[0] as Partial<typeof legacyState.rooms[number]>).crewName;
    expect(new RoomStore({ initialState: legacyState }).getSnapshot(created.snapshot.code)?.crewName).toBe("Ari's crew");
    expect(() => store.apply(createCommand("Ari", "  "))).toThrow(/crew name/i);
  });

  it("creates a room with an opaque host token excluded from snapshots", () => {
    const { store, code, hostToken } = fixture();
    const snapshot = store.getSnapshot(code)!;
    expect(snapshot).toMatchObject({ revision: 1, status: "setup", members: [{ name: "Ari", isHost: true }] });
    expect(JSON.stringify(snapshot)).not.toContain(hostToken);
  });

  it("persists a member's original avatar and resets readiness when customized", () => {
    const { store, code, hostToken } = fixture();
    const initial = store.getSnapshot(code)!;
    expect(initial.members[0].avatar).toEqual({ shell: "chalk", body: "orb", eyes: "round", mouth: "smile" });
    let result = store.apply({ type: "ready", code, expectedRevision: initial.revision, ready: true }, hostToken);
    result = store.apply({ type: "set-avatar", code, expectedRevision: result.snapshot.revision, avatar: { shell: "mint", body: "tall", face: "bar" } }, hostToken);
    expect(result.snapshot.members[0]).toMatchObject({ avatar: { shell: "mint", body: "tall", eyes: "round", mouth: "smile" }, ready: false });
    expect(new RoomStore({ initialState: store.exportState() }).getSnapshot(code)?.members[0].avatar.shell).toBe("mint");
    result = store.apply({ type: "set-avatar", code, expectedRevision: result.snapshot.revision, avatar: { shell: "unsafe", body: "orb", face: "round" } } as never, hostToken);
    expect(result.snapshot.members[0].avatar.shell).toBe("chalk");
  });

  it("keeps older capsule avatars valid after removing the duplicate choice", () => {
    const { store, code, hostToken } = fixture();
    const updated = store.apply({ type: "set-avatar", code, expectedRevision: 1, avatar: { shell: "chalk", body: "capsule", face: "neutral" } }, hostToken);
    expect(updated.snapshot.members[0].avatar.body).toBe("capsule");
  });

  it("locks the room map to the accepted mission dataset", () => {
    const { store, code, hostToken } = fixture();
    const snapshot = store.getSnapshot(code)!;
    expect(snapshot.missionId).toBe(acceptedMission.datasetId);
    expect(() => store.apply({ type: "select-mission", code, expectedRevision: snapshot.revision, missionId: "gale" }, hostToken)).toThrow(/locked/i);
    expect(() => store.apply({ type: "select-mission", code, expectedRevision: snapshot.revision, missionId: "other" }, hostToken)).toThrow(/mission/i);
  });

  it("admits four people at most and gives each a distinct identity", () => {
    const { store, code, join } = fixture();
    join("Bea"); join("Cal"); join("Dee");
    expect(() => join("Eve")).toThrow(/full/i);
    expect(new Set(store.getSnapshot(code)!.members.map((member) => member.id)).size).toBe(4);
  });

  it("reconnects without a new slot and rejects a forged token", () => {
    const { store, code, join } = fixture();
    const bea = join("Bea");
    store.disconnect(bea.token!);
    const restored = store.apply({ type: "reconnect", code, token: bea.token! });
    expect(restored.snapshot.members).toHaveLength(2);
    expect(restored.snapshot.members[1]).toMatchObject({ id: bea.memberId, connected: true });
    expect(() => store.apply({ type: "reconnect", code, token: "forged" })).toThrow(/token/i);
  });

  it("rotates a reconnect secret so the previous connection loses authority", () => {
    const { store, code, join } = fixture();
    const bea = join("Bea");
    store.disconnect(bea.token!);
    const restored = store.apply({ type: "reconnect", code, token: bea.token! });
    expect(restored.token).not.toBe(bea.token);
    expect(() => store.apply({ type: "ready", code, expectedRevision: restored.snapshot.revision, ready: true }, bea.token)).toThrow(/token/i);
    expect(store.apply({ type: "ready", code, expectedRevision: restored.snapshot.revision, ready: true }, restored.token).snapshot.members[1].ready).toBe(true);
  });

  it("rejects stale revisions and unauthorized host actions", () => {
    const { store, code, hostToken, join } = fixture();
    const bea = join("Bea");
    expect(() => store.apply({ type: "select-base", code, expectedRevision: 1, point: { x: 100, y: 100 } }, hostToken)).toThrow(/revision/i);
    expect(() => store.apply({ type: "select-base", code, expectedRevision: 2, point: { x: 100, y: 100 } }, bea.token)).toThrow(/host/i);
  });

  it("transfers hosting to the oldest member when host leaves", () => {
    const { store, code, hostToken, join } = fixture();
    const bea = join("Bea"); join("Cal");
    const left = store.apply({ type: "leave", code, expectedRevision: 3 }, hostToken);
    expect(left.snapshot.members[0]).toMatchObject({ id: bea.memberId, isHost: true });
    expect(left.snapshot.members).toHaveLength(2);
    expect(() => store.apply({ type: "ready", code, expectedRevision: left.snapshot.revision, ready: true }, hostToken)).toThrow(/token/i);
  });

  it("launches only after the base and every member are ready", () => {
    const { store, code, hostToken, join } = fixture();
    const bea = join("Bea");
    let revision = bea.snapshot.revision;
    const apply = (command: Record<string, unknown>, token = hostToken) => {
      const result = store.apply({ ...command, code, expectedRevision: revision } as never, token);
      revision = result.snapshot.revision;
      return result;
    };
    expect(() => apply({ type: "launch" })).toThrow(/ready/i);
    apply({ type: "select-base", point: { x: 100, y: 100 } });
    apply({ type: "ready", ready: true });
    expect(() => apply({ type: "launch" })).toThrow(/ready/i);
    apply({ type: "ready", ready: true }, bea.token);
    const launched = apply({ type: "launch" });
    expect(launched.snapshot).toMatchObject({ status: "launched", base: { x: 100, y: 100 }, missionId: acceptedMission.datasetId });
    expect(launched.snapshot.positions).toHaveProperty(bea.memberId!, { x: 100, y: 100 });
    expect(launched.snapshot.resources[bea.memberId!]).toEqual({ oxygen: 100, battery: 100, stamina: 100, equipment: [] });
  });

  it("stores validated equipment before launch and resets readiness when it changes", () => {
    const { store, code, hostToken } = fixture();
    let result = store.apply({ type: "ready", code, expectedRevision: 1, ready: true }, hostToken);
    result = store.apply({ type: "set-equipment", code, expectedRevision: result.snapshot.revision, equipment: ["camera", "filter"] }, hostToken);
    expect(result.snapshot.members[0].ready).toBe(false);
    expect(result.snapshot.resources[result.memberId!]).toEqual({ oxygen: 100, battery: 100, stamina: 100, equipment: ["camera", "filter"] });
    expect(() => store.apply({ type: "set-equipment", code, expectedRevision: result.snapshot.revision, equipment: ["camera", "camera"] }, hostToken)).toThrow(/equipment/i);
  });

  it("restores legacy batteries and preserves explicitly depleted batteries", () => {
    const { store, code, join } = fixture();
    const other = join("Bea").memberId!;
    const state = store.exportState();
    const [host] = state.rooms[0].members;
    const legacy = state.rooms[0].resources[host.id];
    legacy.oxygen = 83;
    legacy.equipment = ["filter"];
    Reflect.deleteProperty(legacy, "battery");
    state.rooms[0].resources[other].battery = 0;
    const restored = new RoomStore({ initialState: state });
    const persisted = restored.exportState().rooms[0].resources;
    expect(persisted[host.id]).toEqual({ oxygen: 83, battery: 100, stamina: 100, equipment: ["filter"] });
    expect(restored.getSnapshot(code)?.resources[other].battery).toBe(0);
  });

  it("consumes only actual server-approved movement and retains resources through restore", () => {
    const { store, code, hostToken, advance } = fixture();
    let result = store.apply({ type: "select-base", code, expectedRevision: 1, point: { x: 100, y: 100 } }, hostToken);
    result = store.apply({ type: "set-equipment", code, expectedRevision: result.snapshot.revision, equipment: ["camera"] }, hostToken);
    result = store.apply({ type: "ready", code, expectedRevision: result.snapshot.revision, ready: true }, hostToken);
    result = store.apply({ type: "launch", code, expectedRevision: result.snapshot.revision }, hostToken);
    const id = result.memberId!;
    advance(5_000);
    result = store.apply({ type: "move", code, expectedRevision: result.snapshot.revision, point: { x: 300, y: 100 } }, hostToken);
    expect(result.snapshot.positions[id]).toEqual({ x: 110, y: 100 });
    expect(result.snapshot.resources[id]).toEqual({ oxygen: 99.4, battery: 100, stamina: 99.1, equipment: ["camera"] });
    const restored = new RoomStore({ initialState: store.exportState() });
    expect(restored.getSnapshot(code)?.resources[id]).toEqual(result.snapshot.resources[id]);
  });

  it("stops travel when the limiting illustrative resource is exhausted", () => {
    const { store, code, hostToken, advance } = fixture();
    let result = store.apply({ type: "select-base", code, expectedRevision: 1, point: { x: 100, y: 100 } }, hostToken);
    result = store.apply({ type: "ready", code, expectedRevision: result.snapshot.revision, ready: true }, hostToken);
    result = store.apply({ type: "launch", code, expectedRevision: result.snapshot.revision }, hostToken);
    advance(1_000_000);
    result = store.apply({ type: "move", code, expectedRevision: result.snapshot.revision, point: { x: 2000, y: 100 } }, hostToken);
    const id = result.memberId!;
    expect(result.snapshot.positions[id].x).toBeCloseTo(100 + 100 / 0.09, 2);
    expect(result.snapshot.resources[id].stamina).toBe(0);
    const stopped = store.apply({ type: "move", code, expectedRevision: result.snapshot.revision, point: { x: 2000, y: 100 } }, hostToken);
    expect(stopped.snapshot.positions[id]).toEqual(result.snapshot.positions[id]);
  });

  it("rejects invalid points and prelaunch movement, then clamps travel to speed and sector bounds", () => {
    const { store, code, hostToken, advance } = fixture();
    expect(() => store.apply({ type: "select-base", code, expectedRevision: 1, point: { x: Number.NaN, y: 0 } }, hostToken)).toThrow(/point/i);
    expect(() => store.apply({ type: "move", code, expectedRevision: 1, point: { x: 1, y: 1 } }, hostToken)).toThrow(/launch/i);
    let result = store.apply({ type: "select-base", code, expectedRevision: 1, point: { x: 100, y: 100 } }, hostToken);
    result = store.apply({ type: "ready", code, expectedRevision: result.snapshot.revision, ready: true }, hostToken);
    result = store.apply({ type: "launch", code, expectedRevision: result.snapshot.revision }, hostToken);
    const early = store.apply({ type: "move", code, expectedRevision: result.snapshot.revision, point: { x: 300, y: 100 } }, hostToken);
    expect(early.snapshot.positions[early.memberId!]).toEqual({ x: 100, y: 100 });
    advance(5_000);
    const moved = store.apply({ type: "move", code, expectedRevision: early.snapshot.revision, point: { x: 300, y: 100 } }, hostToken);
    expect(moved.snapshot.positions[moved.memberId!]).toEqual({ x: 110, y: 100 });
    advance(5_000);
    const bounded = store.apply({ type: "move", code, expectedRevision: moved.snapshot.revision, point: { x: 2049, y: 100 } }, hostToken);
    expect(bounded.snapshot.positions[bounded.memberId!]).toEqual({ x: 120, y: 100 });
  });

  it("rejects malformed commands without changing room revision", () => {
    const { store, code, hostToken } = fixture();
    expect(() => store.apply({ type: "ready", code, expectedRevision: 1, ready: "yes" } as never, hostToken)).toThrow(/ready/i);
    expect(() => store.apply({ type: "unknown", code, expectedRevision: 1 } as never, hostToken)).toThrow(/command/i);
    expect(store.getSnapshot(code)!.revision).toBe(1);
  });

  it("seeds map-ready Jezero quests once and tracks accepted quest IDs in snapshots", () => {
    const { store, code, hostToken, join } = fixture();
    const bea = join("Bea");
    let result = bea;
    expect(result.snapshot.quests.map((quest) => quest.id)).toEqual(["builtin-A", "builtin-B", "builtin-C"]);
    result = store.apply({ type: "quest-accept", code, expectedRevision: result.snapshot.revision, questId: "builtin-A", memberIds: [bea.memberId!] }, bea.token);
    expect(result.snapshot.activeQuestIds).toEqual(["builtin-A"]);
    expect(result.snapshot.quests[0]).toMatchObject({ status: "accepted", point: { x: 630, y: 710 } });
    expect(() => store.apply({ type: "quest-accept", code, expectedRevision: result.snapshot.revision, questId: "builtin-A", memberIds: [bea.memberId!] }, bea.token)).toThrow(/published/i);
    const restored = new RoomStore({ initialState: store.exportState() });
    expect(restored.getSnapshot(code)?.activeQuestIds).toEqual(["builtin-A"]);
    expect(restored.getSnapshot(code)?.quests).toHaveLength(3);
  });

  it("validates quest commands through room membership and revision", () => {
    const { store, code, hostToken } = fixture();
    expect(() => store.apply({ type: "quest-create", code, expectedRevision: 1, input: questInput }, "forged")).toThrow(/token/i);
    const created = store.apply({ type: "quest-create", code, expectedRevision: 1, input: questInput }, hostToken);
    const draft = created.snapshot.quests.find((quest) => quest.title === "Inspect the ridge")!;
    expect(draft).toMatchObject({ status: "draft", title: "Inspect the ridge" });
    expect(() => store.apply({ type: "quest-publish", code, expectedRevision: 1, questId: draft.id }, hostToken)).toThrow(/revision/i);
    const published = store.apply({ type: "quest-publish", code, expectedRevision: created.snapshot.revision, questId: draft.id }, hostToken);
    expect(published.snapshot.quests.find((quest) => quest.id === draft.id)?.status).toBe("published");
  });

  it("persists rooms atomically and restores membership without an extra slot", async () => {
    const directory = await mkdtemp(joinPath(tmpdir(), "earthapps-room-"));
    try {
      const path = joinPath(directory, "rooms.json");
      const { store, code, join } = fixture();
      const bea = join("Bea");
      await saveRooms(path, store.exportState());
      const restored = new RoomStore({ initialState: await loadRooms(path) });
      expect(restored.getSnapshot(code)?.members).toHaveLength(2);
      expect(restored.getSnapshot(code)?.members[1].connected).toBe(false);
      const resumed = restored.apply({ type: "reconnect", code, token: bea.token! });
      expect(resumed.snapshot.members).toHaveLength(2);
      expect((await readFile(path, "utf8")).includes(bea.token!)).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("shared expedition plan", () => {
  it("defaults a new room and migrates a persisted room without a plan", () => {
    const { store, code } = fixture();
    const expected = { primaryObjectiveId: "mission-test", optionalObjectiveIds: [], routePreference: "efficient" };
    expect(store.getSnapshot(code)?.expeditionPlan).toEqual(expected);
    const state = store.exportState();
    delete (state.rooms[0] as Partial<typeof state.rooms[number]>).expeditionPlan;
    expect(new RoomStore({ initialState: state }).getSnapshot(code)?.expeditionPlan).toEqual(expected);
  });

  it("broadcasts a crew member's ordered plan and restores it for both members", () => {
    const { store, code, hostToken, join } = fixture();
    const guest = join("Bea");
    const accepted = store.apply({ type: "quest-accept", code, expectedRevision: guest.snapshot.revision, questId: "builtin-A", memberIds: [guest.memberId!] }, guest.token);
    const plan = { primaryObjectiveId: "mission-test", optionalObjectiveIds: ["builtin-B", "builtin-A"], routePreference: "lower-exposure" as const };
    const update = store.apply({ type: "set-expedition-plan", code, expectedRevision: accepted.snapshot.revision, plan }, guest.token);
    expect(update.events).toEqual([{ type: "snapshot", snapshot: expect.objectContaining({ expeditionPlan: plan }) }]);
    expect(store.apply({ type: "reconnect", code, token: hostToken }).snapshot.expeditionPlan).toEqual(plan);
    expect(store.apply({ type: "reconnect", code, token: guest.token! }).snapshot.expeditionPlan).toEqual(plan);
    expect(new RoomStore({ initialState: store.exportState() }).getSnapshot(code)?.expeditionPlan).toEqual(plan);
  });

  it("rejects stale revisions and invalid objective IDs without mutating the snapshot", () => {
    const { store, code, hostToken } = fixture();
    const created = store.apply({ type: "quest-create", code, expectedRevision: 1, input: questInput }, hostToken);
    const draftId = created.snapshot.quests.find(({ status }) => status === "draft")!.id;
    const plan = { primaryObjectiveId: "mission-test", optionalObjectiveIds: ["builtin-A"], routePreference: "efficient" as const };
    const update = (expectedRevision: number, overrides = {}) => store.apply({ type: "set-expedition-plan", code, expectedRevision, plan: { ...plan, ...overrides } }, hostToken);
    expect(() => update(1)).toThrow(/revision/i);
    expect(() => update(2, { optionalObjectiveIds: ["builtin-A", "builtin-A"] })).toThrow(/duplicate/i);
    for (const id of ["unavailable", draftId, "mission-test"]) {
      expect(() => update(2, { optionalObjectiveIds: [id] })).toThrow(/objective/i);
    }
    expect(() => update(2, { primaryObjectiveId: "builtin-A" })).toThrow(/primary/i);
    expect(() => update(2, { routePreference: "fastest" })).toThrow(/preference/i);
    expect(store.getSnapshot(code)).toEqual(created.snapshot);
  });
});

describe("room simulation", () => {
  it("uses the duration of the dated replay and preserves it across reconnects", () => {
    const { store, code, hostToken } = fixture();
    const scenarioId = "jezero-my36-2022-01-08-ds1";
    expect(() => store.apply({ type: "set-simulation-scenario", code, expectedRevision: 1, scenarioId, startLs: 90 }, hostToken)).toThrow(/scenario/i);
    const selected = store.apply({ type: "set-simulation-scenario", code, expectedRevision: 1, scenarioId, startLs: 155 }, hostToken).snapshot;
    const end = store.apply({ type: "advance-simulation", code, expectedRevision: selected.revision, deltaSol: 3 }, hostToken).snapshot;
    expect(end.simulation.elapsedSol).toBeCloseTo(0.986);
    const restored = new RoomStore({ initialState: store.exportState() });
    expect(restored.apply({ type: "reconnect", code, token: hostToken }).snapshot.simulation).toEqual(end.simulation);
  });

  it("migrates old rooms and applies only revision-checked shared clock steps", () => {
    const { store, code, hostToken } = fixture();
    const legacy = store.exportState();
    delete (legacy.rooms[0] as Partial<typeof legacy.rooms[number]>).simulation;
    const restored = new RoomStore({ initialState: legacy });
    expect(restored.getSnapshot(code)?.simulation).toEqual({ scenarioId: null, startLs: 0, elapsedSol: 0, playing: false });
    let snapshot = restored.apply({ type: "set-simulation-scenario", code, expectedRevision: 1, scenarioId: "modeled-central-v1", startLs: 250 }, hostToken).snapshot;
    expect(() => restored.apply({ type: "advance-simulation", code, expectedRevision: 1, deltaSol: 1 }, hostToken)).toThrow(/revision/);
    snapshot = restored.apply({ type: "set-simulation-playing", code, expectedRevision: snapshot.revision, playing: true }, hostToken).snapshot;
    expect(snapshot.simulation).toMatchObject({ playing: true, elapsedSol: 0 });
    snapshot = restored.apply({ type: "advance-simulation", code, expectedRevision: snapshot.revision, deltaSol: 100 }, hostToken).snapshot;
    expect(snapshot.simulation).toMatchObject({ elapsedSol: 3, playing: false });
    snapshot = restored.apply({ type: "reset-simulation", code, expectedRevision: snapshot.revision }, hostToken).snapshot;
    expect(snapshot.simulation).toEqual({ scenarioId: "modeled-central-v1", startLs: 250, elapsedSol: 0, playing: false });
    expect(() => restored.apply({ type: "set-simulation-scenario", code, expectedRevision: snapshot.revision, scenarioId: "invented", startLs: 250 }, hostToken)).toThrow(/scenario/i);
  });
});
