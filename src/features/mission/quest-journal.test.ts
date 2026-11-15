import { expect, it } from "vitest";
import { loadJournal, saveJournal } from "./quest-journal";
it("isolates datasets, bounds notes and tolerates invalid or blocked storage", () => {
  const entries = new Map<string, string>();
  const storage = {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => {
      entries.set(key, value);
    },
  };
  expect(
    saveJournal(storage, "one", {
      A: { reviewed: true, note: "x".repeat(600) },
    }),
  ).toBe(true);
  expect(loadJournal(storage, "one").A?.note.length).toBe(500);
  expect(loadJournal(storage, "two")).toEqual({});
  storage.setItem("jezero:journal:v1:one", "broken");
  expect(loadJournal(storage, "one")).toEqual({});
  expect(
    loadJournal(
      {
        getItem: () => {
          throw Error();
        },
      },
      "one",
    ),
  ).toEqual({});
  expect(
    saveJournal(
      {
        setItem: () => {
          throw Error();
        },
      },
      "one",
      {},
    ),
  ).toBe(false);
});
