import { ZodError } from "zod";
import { catalogObjectives } from "../../../features/quests/catalog-objectives";
import { PrismaCatalog } from "../../../features/quests/prisma-catalog";
import type { Quest } from "../../../features/quests/quest-types";

type QuestCatalog = Pick<PrismaCatalog, "list" | "create">;

export function createQuestHandlers(catalog: QuestCatalog = new PrismaCatalog()) {
  return {
    async GET() {
      const bundledMissions = catalogObjectives();
      try {
        return Response.json([...bundledMissions, ...await catalog.list()]);
      } catch {
        return Response.json(bundledMissions, {
          headers: {
            "cache-control": "no-store",
            "x-mission-catalog-status": "bundled-fallback",
          },
        });
      }
    },

    async POST(request: Request) {
      try {
        const input: unknown = await request.json();
        const quest: Quest = await catalog.create(input);
        return Response.json(quest, { status: 201 });
      } catch (error) {
        if (error instanceof ZodError || error instanceof SyntaxError) {
          return Response.json({ error: "Invalid quest input." }, { status: 400 });
        }
        return Response.json({ error: "Could not save quest." }, { status: 500 });
      }
    },
  };
}

const handlers = createQuestHandlers();
export const GET = handlers.GET;
export const POST = handlers.POST;
