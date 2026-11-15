import { randomUUID } from "node:crypto";
import { questInputSchema } from "./quest-schema.ts";
import type { Quest, QuestCommand, QuestContext, QuestStatus } from "./quest-types";

const JEZERO_DATASET = "jezero-hirise-048842-048908-v1";
const builtIns = [
  { id: "builtin-A", title: "Survey the surface contact", point: { x: 630, y: 710 }, hypothesis: "A visible boundary may separate surfaces with different texture, tone, or roughness; imagery alone cannot confirm a geologic unit boundary.", description: "Document a short, hypothetical traverse across a visible surface contact in the Jezero sector. Compare both sides using the same viewing scale and lighting notes.", expectedObservations: "Paired context and close-range images, a contact sketch, and side-by-side notes on grain appearance, clast abundance, and surface texture.", completionCriteria: "Record at least two matched observations on each side, mark the proposed contact on the sector map, and note any uncertainty or obscured ground." },
  { id: "builtin-B", title: "Profile the ridge", point: { x: 1150, y: 1350 }, hypothesis: "Changes in apparent bedding, exposure, and slope along a ridge transect may help distinguish resistant ledges from finer or more erodible material.", description: "Plan a short, non-contact visual transect along a mapped ridge-like landform. Describe its relief and visible layering without assuming the ridge is a specific rock unit.", expectedObservations: "Three station notes, a simple profile sketch, apparent layer orientation where visible, and images that show both the outcrop and surrounding terrain.", completionCriteria: "Document start, crest, and end stations; connect observations to the plotted transect; flag occlusion and any slope or rockfall concerns before proposing access." },
  { id: "builtin-C", title: "Compare the thermal pattern", point: { x: 1580, y: 900 }, hypothesis: "Differences in surface material and roughness can contribute to regional thermal contrasts, but a coarse orbital thermal layer cannot identify composition by itself.", description: "Compare a visible surface patch with the available archival thermal context. Treat the thermal layer as regional context and separate measured image patterns from field interpretation.", expectedObservations: "Annotated optical and thermal views, a description of patch boundaries and texture, and a list of plausible explanations with confidence notes.", completionCriteria: "Record the compared map areas and data layers, describe one agreement and one mismatch between optical and thermal patterns, and make no composition claim from brightness alone." },
] as const;

export class QuestStore {
  private quests: Quest[];

  constructor(initial: Quest[] = []) { this.quests = structuredClone(initial); }

  list(): Quest[] { return structuredClone(this.quests); }

  seedBuiltIns(roomCode: string, datasetId: string): void {
    if (datasetId !== JEZERO_DATASET) return;
    for (const item of builtIns) {
      if (this.quests.some((quest) => quest.id === item.id && quest.datasetId === datasetId && quest.roomCode === roomCode)) continue;
      this.quests.push({
        ...item, roomCode, datasetId, source: "built-in", status: "published", createdBy: null,
        provenance: "This hypothetical training proposal is placed on the archival Jezero HiRISE sector. The pin is not a verified named outcrop or assessed field site; map terrain and hazards before travel.",
        equipment: item.id === "builtin-A" ? ["field camera", "scale card", "sector map"] : item.id === "builtin-B" ? ["field camera", "clinometer", "sector map"] : ["optical and thermal map layers", "field camera", "observation log"],
        recommendedCrewSize: item.id === "builtin-A" ? 2 : item.id === "builtin-B" ? 3 : 1,
        durationMin: item.id === "builtin-A" ? 45 : item.id === "builtin-B" ? 75 : 35,
        difficulty: item.id === "builtin-A" ? "moderate" : item.id === "builtin-B" ? "high" : "low",
        hazards: item.id === "builtin-A" ? ["Uneven or obscured ground; avoid approaching an unassessed contact edge."] : item.id === "builtin-B" ? ["Steep or loose slopes, unstable blocks, and limited sightlines near ridge edges."] : ["Low-resolution thermal context; do not treat map contrast as a local temperature or safety measurement."], assignedMemberIds: [], completion: null, resolution: null,
      });
    }
  }

  apply(command: QuestCommand, context: QuestContext): Quest {
    if (command.type === "quest-create") {
      const input = questInputSchema.parse(command.input);
      const quest: Quest = {
        ...input, id: randomUUID(), roomCode: context.roomCode, datasetId: context.datasetId,
        source: "crew", status: "draft", createdBy: context.actorId,
        provenance: context.datasetId === "gale" ? "Crew-authored proposal for simulated Gale terrain; location and safety are unverified." : context.datasetId === "valles" ? "Crew-authored proposal for simulated Melas Chasma terrain; location and safety are unverified." : "Crew-authored proposal for the bundled Jezero sector; location and safety are unverified.",
        assignedMemberIds: [], completion: null, resolution: null,
      };
      this.quests.push(quest);
      return structuredClone(quest);
    }
    const quest = this.quests.find((item) => item.id === command.questId && item.roomCode === context.roomCode);
    if (!quest) throw new Error("Quest not found");
    switch (command.type) {
      case "quest-publish":
        requireStatus(quest, "draft");
        quest.status = "published";
        break;
      case "quest-accept":
        requireStatus(quest, "published");
          if (!Array.isArray(command.memberIds) || command.memberIds.length < 1 || command.memberIds.length > 5 || new Set(command.memberIds).size !== command.memberIds.length || !command.memberIds.every((id) => context.memberIds.includes(id))) {
          throw new Error("Invalid assigned member list");
        }
        quest.assignedMemberIds = [...command.memberIds];
        quest.status = "accepted";
        break;
      case "quest-start":
        requireStatus(quest, "accepted");
        requireAssigneeOrHost(quest, context);
        quest.status = "in-progress";
        break;
      case "quest-complete":
        requireStatus(quest, "in-progress");
        requireAssigneeOrHost(quest, context);
        quest.completion = { observation: requiredText(command.observation, "observation"), authorId: context.actorId };
        quest.status = "completed";
        break;
      case "quest-cancel":
        if (!["draft", "published", "accepted", "in-progress"].includes(quest.status)) throw new Error("Invalid quest transition");
        requireStakeholder(quest, context);
        quest.resolution = { reason: requiredText(command.reason, "reason"), authorId: context.actorId };
        quest.status = "cancelled";
        break;
      case "quest-fail":
        if (!["accepted", "in-progress"].includes(quest.status)) throw new Error("Invalid quest transition");
        requireAssigneeOrHost(quest, context);
        quest.resolution = { reason: requiredText(command.reason, "reason"), authorId: context.actorId };
        quest.status = "failed";
        break;
      default: throw new Error("Invalid quest command");
    }
    return structuredClone(quest);
  }
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length < 1 || value.trim().length > 500) throw new Error(`Invalid ${label}`);
  return value.trim();
}
function requireStatus(quest: Quest, status: QuestStatus) { if (quest.status !== status) throw new Error(`Invalid quest transition: expected ${status}`); }
function requireAssigneeOrHost(quest: Quest, context: QuestContext) {
  if (!context.isHost && !quest.assignedMemberIds.includes(context.actorId)) throw new Error("Only assigned members or the host can update this quest");
}
function requireStakeholder(quest: Quest, context: QuestContext) {
  if (!context.isHost && quest.createdBy !== context.actorId && !quest.assignedMemberIds.includes(context.actorId)) throw new Error("Only the creator, assigned members, or host can cancel this quest");
}
