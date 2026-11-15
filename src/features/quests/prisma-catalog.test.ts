import { describe, expect, it, vi } from "vitest";
import { PrismaCatalog } from "./prisma-catalog";

const input = {
  title: "Survey ridge",
  description: "Compare two visible layers",
  hypothesis: "The upper layer is finer",
  point: { x: 500, y: 600 },
  equipment: ["camera"],
  recommendedCrewSize: 2,
  durationMin: 45,
  difficulty: "moderate" as const,
  hazards: ["slope"],
  expectedObservations: "Layer sketches",
  completionCriteria: "Record a sketch and comparison",
};

const storedMission = {
  ...input,
  id: "507f1f77bcf86cd799439011",
  roomCode: "catalog",
  datasetId: "jezero-hirise-048842-048908-v1",
  source: "crew",
  provenance: "Crew-authored proposal for the bundled Jezero sector; location and safety are unverified.",
  status: "published",
  createdBy: "catalog",
  assignedMemberIds: [],
  completion: null,
  resolution: null,
  createdAt: new Date("2026-11-15T00:00:00Z"),
};

describe("PrismaCatalog", () => {
  it("reads missions in creation order and returns the quest API shape", async () => {
    const findMany = vi.fn().mockResolvedValue([storedMission]);
    const catalog = new PrismaCatalog({ findMany, create: vi.fn() });

    await expect(catalog.list()).resolves.toEqual([expect.objectContaining({
      id: storedMission.id,
      title: input.title,
      status: "published",
      source: "crew",
    })]);
    expect(findMany).toHaveBeenCalledWith({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  });

  it("saves a normalized proposal with the current catalog defaults", async () => {
    const create = vi.fn().mockResolvedValue(storedMission);
    const catalog = new PrismaCatalog({ findMany: vi.fn(), create });

    await expect(catalog.create({ ...input, title: " Survey ridge " })).resolves.toMatchObject({
      id: storedMission.id,
      title: "Survey ridge",
      status: "published",
      roomCode: "catalog",
      source: "crew",
    });
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      title: "Survey ridge",
      datasetId: "jezero-hirise-048842-048908-v1",
      status: "published",
      assignedMemberIds: [],
      completion: null,
      resolution: null,
    }) });
  });

  it("rejects invalid proposals before writing to MongoDB", async () => {
    const create = vi.fn();
    const catalog = new PrismaCatalog({ findMany: vi.fn(), create });

    await expect(catalog.create({ ...input, point: { x: 2049, y: 0 } })).rejects.toThrow();
    expect(create).not.toHaveBeenCalled();
  });
});
