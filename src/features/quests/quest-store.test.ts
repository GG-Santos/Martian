import { describe, expect, it } from "vitest";
import { QuestStore } from "./quest-store";
import type { QuestInput } from "./quest-types";

const input: QuestInput = {
  title: "Inspect the ridge", description: "Compare two exposed layers",
  hypothesis: "The upper layer is finer", point: { x: 500, y: 600 },
  equipment: ["camera"], recommendedCrewSize: 2, durationMin: 45,
  difficulty: "moderate", hazards: ["slope"],
  expectedObservations: "Layer sketches", completionCriteria: "Record a sketch and comparison",
};
const context = { roomCode: "ABC123", datasetId: "jezero", actorId: "ari", memberIds: ["ari", "bea"] };

describe("QuestStore", () => {
  it("labels crew quests in simulated sectors without claiming Jezero observations", () => {
    const store = new QuestStore();
    const draft = store.apply({ type: "quest-create", input }, { ...context, datasetId: "gale" });
    expect(draft.provenance).toMatch(/simulated.*Gale/i);
    expect(draft.provenance).not.toMatch(/bundled Jezero/);
  });
  it("validates required fields and sector coordinates before creating", () => {
    const store = new QuestStore();
    expect(() => store.apply({ type: "quest-create", input: { ...input, title: " " } }, context)).toThrow(/title/i);
    expect(() => store.apply({ type: "quest-create", input: { ...input, point: { x: 2049, y: 1 } } }, context)).toThrow(/point/i);
    expect(() => store.apply({ type: "quest-create", input: { ...input, point: { x: Number.NaN, y: 1 } } }, context)).toThrow(/point/i);
    expect(store.list()).toHaveLength(0);
  });

  it("publishes, accepts once for a valid crew, starts, and completes with evidence", () => {
    const store = new QuestStore();
    const draft = store.apply({ type: "quest-create", input }, context);
    expect(draft).toMatchObject({ status: "draft", createdBy: "ari", source: "crew" });
    expect(() => store.apply({ type: "quest-accept", questId: draft.id, memberIds: ["ari"] }, context)).toThrow(/published/i);
    store.apply({ type: "quest-publish", questId: draft.id }, context);
    expect(() => store.apply({ type: "quest-accept", questId: draft.id, memberIds: ["stranger"] }, context)).toThrow(/member/i);
    const accepted = store.apply({ type: "quest-accept", questId: draft.id, memberIds: ["ari", "bea"] }, context);
    expect(accepted).toMatchObject({ status: "accepted", assignedMemberIds: ["ari", "bea"] });
    expect(() => store.apply({ type: "quest-accept", questId: draft.id, memberIds: ["ari"] }, context)).toThrow(/published/i);
    store.apply({ type: "quest-start", questId: draft.id }, context);
    expect(() => store.apply({ type: "quest-complete", questId: draft.id, observation: " " }, context)).toThrow(/observation/i);
    const complete = store.apply({ type: "quest-complete", questId: draft.id, observation: "Upper layer has finer grains" }, context);
    expect(complete).toMatchObject({ status: "completed", completion: { observation: "Upper layer has finer grains", authorId: "ari" } });
  });

  it("requires reasons for cancellation and failure and rejects invalid transitions", () => {
    const store = new QuestStore();
    const draft = store.apply({ type: "quest-create", input }, context);
    expect(() => store.apply({ type: "quest-cancel", questId: draft.id, reason: "" }, context)).toThrow(/reason/i);
    store.apply({ type: "quest-publish", questId: draft.id }, context);
    store.apply({ type: "quest-accept", questId: draft.id, memberIds: ["ari"] }, context);
    store.apply({ type: "quest-start", questId: draft.id }, context);
    expect(() => store.apply({ type: "quest-fail", questId: draft.id, reason: " " }, context)).toThrow(/reason/i);
    expect(store.apply({ type: "quest-fail", questId: draft.id, reason: "No sample available" }, context)).toMatchObject({ status: "failed", resolution: { reason: "No sample available", authorId: "ari" } });
    expect(() => store.apply({ type: "quest-complete", questId: draft.id, observation: "late" }, context)).toThrow(/transition/i);
  });

  it("restricts completion to assigned members or host", () => {
    const store = new QuestStore();
    const draft = store.apply({ type: "quest-create", input }, context);
    store.apply({ type: "quest-publish", questId: draft.id }, context);
    store.apply({ type: "quest-accept", questId: draft.id, memberIds: ["ari"] }, context);
    store.apply({ type: "quest-start", questId: draft.id }, context);
    expect(() => store.apply({ type: "quest-complete", questId: draft.id, observation: "Evidence" }, { ...context, actorId: "bea" })).toThrow(/assigned|host/i);
    expect(store.apply({ type: "quest-complete", questId: draft.id, observation: "Evidence" }, { ...context, actorId: "bea", isHost: true }).status).toBe("completed");
  });

  it("seeds the three built-in Jezero quests only once and preserves them through restore", () => {
    const store = new QuestStore();
    store.seedBuiltIns("ABC123", "jezero-hirise-048842-048908-v1");
    store.seedBuiltIns("ABC123", "jezero-hirise-048842-048908-v1");
    const builtIns = store.list();
    expect(builtIns.map((quest) => quest.id)).toEqual(["builtin-A", "builtin-B", "builtin-C"]);
    expect(builtIns.every((quest) => quest.status === "published" && quest.source === "built-in")).toBe(true);
    expect(builtIns.every((quest) => quest.provenance.includes("hypothetical") && quest.provenance.includes("HiRISE"))).toBe(true);
    expect(builtIns.map((quest) => quest.point)).toEqual([{ x: 630, y: 710 }, { x: 1150, y: 1350 }, { x: 1580, y: 900 }]);
    const restored = new QuestStore(store.list());
    restored.seedBuiltIns("ABC123", "jezero-hirise-048842-048908-v1");
    expect(restored.list()).toHaveLength(3);
  });

  it("seeds built-in quests independently for two rooms using the same dataset", () => {
    const store = new QuestStore();
    store.seedBuiltIns("ABC123", "jezero-hirise-048842-048908-v1");
    store.seedBuiltIns("DEF456", "jezero-hirise-048842-048908-v1");
    expect(store.list().filter((quest) => quest.roomCode === "ABC123")).toHaveLength(3);
    expect(store.list().filter((quest) => quest.roomCode === "DEF456")).toHaveLength(3);
  });
});
