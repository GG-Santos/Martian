import type { PrismaClient } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { questInputSchema, questSchema, type Quest } from "./quest-schema";

const JEZERO_DATASET = "jezero-hirise-048842-048908-v1";
const CATALOG_PROVENANCE = "Crew-authored proposal for the bundled Jezero sector; location and safety are unverified.";
type MissionModel = Pick<PrismaClient["mission"], "findMany" | "create">;

export class PrismaCatalog {
  constructor(private readonly missions: MissionModel = prisma.mission) {}

  async list(): Promise<Quest[]> {
    const records = await this.missions.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    return records.map((record) => questSchema.parse(record));
  }

  async create(value: unknown): Promise<Quest> {
    const input = questInputSchema.parse(value);
    const record = await this.missions.create({
      data: {
        ...input,
        roomCode: "catalog",
        datasetId: JEZERO_DATASET,
        source: "crew",
        provenance: CATALOG_PROVENANCE,
        status: "published",
        createdBy: "catalog",
        assignedMemberIds: [],
        completion: null,
        resolution: null,
      },
    });
    return questSchema.parse(record);
  }
}
