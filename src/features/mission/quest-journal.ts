import type { StopId } from "./types";
export type JournalEntry = { reviewed: boolean; note: string };
export type QuestJournalState = Partial<Record<StopId, JournalEntry>>;
function sanitize(value: unknown): QuestJournalState {
  const result: QuestJournalState = {};
  if (!value || typeof value !== "object") return result;
  for (const id of ["A", "B", "C"] as const) {
    const entry = (value as QuestJournalState)[id];
    if (
      entry &&
      typeof entry.note === "string" &&
      typeof entry.reviewed === "boolean"
    )
      result[id] = { reviewed: entry.reviewed, note: entry.note.slice(0, 500) };
  }
  return result;
}
export function loadJournal(
  storage: Pick<Storage, "getItem">,
  datasetId: string,
): QuestJournalState {
  try {
    return sanitize(
      JSON.parse(storage.getItem(`jezero:journal:v1:${datasetId}`) ?? "{}"),
    );
  } catch {
    return {};
  }
}
export function saveJournal(
  storage: Pick<Storage, "setItem">,
  datasetId: string,
  journal: QuestJournalState,
): boolean {
  try {
    storage.setItem(
      `jezero:journal:v1:${datasetId}`,
      JSON.stringify(sanitize(journal)),
    );
    return true;
  } catch {
    return false;
  }
}
