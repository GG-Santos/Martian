import { z } from "zod";

const requiredText = z.string().trim().min(1).max(500);
const shortTextList = z.array(z.string().trim().min(1).max(80)).max(12);

export const questInputSchema = z.object({
  title: requiredText,
  description: requiredText,
  hypothesis: requiredText,
  point: z.object({
    x: z.number().finite().min(0).max(2048),
    y: z.number().finite().min(0).max(2048),
  }),
  equipment: shortTextList,
  recommendedCrewSize: z.number().int().min(1).max(5),
  durationMin: z.number().finite().gt(0).max(1440),
  difficulty: z.enum(["low", "moderate", "high"]),
  hazards: shortTextList,
  expectedObservations: requiredText,
  completionCriteria: requiredText,
});

export const questStatusSchema = z.enum([
  "draft",
  "published",
  "accepted",
  "in-progress",
  "completed",
  "cancelled",
  "failed",
]);

export const questSchema = questInputSchema.extend({
  id: z.string().min(1),
  roomCode: z.string().min(1),
  datasetId: z.string().min(1),
  source: z.enum(["built-in", "crew"]),
  provenance: requiredText,
  status: questStatusSchema,
  createdBy: z.string().nullable(),
  assignedMemberIds: z.array(z.string()),
  completion: z.object({ observation: requiredText, authorId: z.string().min(1) }).nullable(),
  resolution: z.object({ reason: requiredText, authorId: z.string().min(1) }).nullable(),
});

export type QuestInput = z.infer<typeof questInputSchema>;
export type Quest = z.infer<typeof questSchema>;
export type QuestStatus = z.infer<typeof questStatusSchema>;
