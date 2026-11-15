import { describe, expect, it } from "vitest";
import { questInputSchema, questSchema } from "./quest-schema";

const input = {
  title: "  Inspect the ridge  ",
  description: "Compare two exposed layers",
  hypothesis: "The upper layer is finer",
  point: { x: 500, y: 600 },
  equipment: [" camera "],
  recommendedCrewSize: 2,
  durationMin: 45,
  difficulty: "moderate",
  hazards: ["slope"],
  expectedObservations: "Layer sketches",
  completionCriteria: "Record a sketch and comparison",
};

describe("quest schemas", () => {
  it("normalizes valid input using the existing quest limits", () => {
    expect(questInputSchema.parse({ ...input, ignored: true })).toEqual({
      ...input,
      title: "Inspect the ridge",
      equipment: ["camera"],
    });
  });

  it("rejects out-of-range coordinates, empty text, and oversized lists", () => {
    expect(questInputSchema.safeParse({ ...input, point: { x: 2049, y: 0 } }).success).toBe(false);
    expect(questInputSchema.safeParse({ ...input, title: "   " }).success).toBe(false);
    expect(questInputSchema.safeParse({ ...input, equipment: Array(13).fill("camera") }).success).toBe(false);
  });

  it("accepts the complete persisted quest response shape", () => {
    expect(questSchema.parse({
      ...input,
      title: "Inspect the ridge",
      id: "stored-id",
      roomCode: "catalog",
      datasetId: "jezero-hirise-048842-048908-v1",
      source: "crew",
      provenance: "Crew-authored proposal",
      status: "published",
      createdBy: "catalog",
      assignedMemberIds: [],
      completion: null,
      resolution: null,
    })).toMatchObject({ id: "stored-id", status: "published", point: { x: 500, y: 600 } });
  });
});
