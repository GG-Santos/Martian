import { describe, expect, it, vi } from "vitest";
import { createQuestHandlers } from "./route";

describe("quest API handlers", () => {
  it("keeps built-in objectives first and appends stored crew proposals", async () => {
    const proposal = { id: "stored", title: "Survey ridge", source: "crew" };
    const { GET } = createQuestHandlers({ list: vi.fn().mockResolvedValue([proposal]), create: vi.fn() });

    const response = await GET();
    const quests = await response.json();

    expect(response.status).toBe(200);
    expect(quests.at(-1)).toEqual(proposal);
    expect(quests.slice(0, -1).every((quest: { source: string }) => quest.source === "built-in")).toBe(true);
  });

  it("returns a generic server error when MongoDB cannot save a proposal", async () => {
    const { POST } = createQuestHandlers({ list: vi.fn(), create: vi.fn().mockRejectedValue(new Error("private database detail")) });

    const response = await POST(new Request("http://localhost/api/quests", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Could not save quest." });
  });

  it("returns a client error for malformed JSON", async () => {
    const create = vi.fn();
    const { POST } = createQuestHandlers({ list: vi.fn(), create });

    const response = await POST(new Request("http://localhost/api/quests", { method: "POST", body: "{" }));

    expect(response.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
