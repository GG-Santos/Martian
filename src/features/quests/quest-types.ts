import type { QuestInput } from "./quest-schema";

export type { Quest, QuestInput, QuestStatus } from "./quest-schema";
export type QuestCommand =
  | { type: "quest-create"; input: QuestInput }
  | { type: "quest-publish"; questId: string }
  | { type: "quest-accept"; questId: string; memberIds: string[] }
  | { type: "quest-start"; questId: string }
  | { type: "quest-complete"; questId: string; observation: string }
  | { type: "quest-cancel"; questId: string; reason: string }
  | { type: "quest-fail"; questId: string; reason: string };
export type QuestContext = {
  roomCode: string;
  datasetId: string;
  actorId: string;
  memberIds: string[];
  isHost?: boolean;
};
