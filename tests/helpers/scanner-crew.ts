import type { Page } from "@playwright/test";
import { RoomStore } from "../../src/features/session/room-store";
import { LocalRoomCommandRepository, RoomService } from "../../src/features/session/room-service";
import { catalogObjectives } from "../../src/features/quests/catalog-objectives";
import type { ClientCommand } from "../../src/features/session/protocol";

// Exercise the real room protocol and mutations, with transport/storage kept local
// to this browser test. Reload restores the same token and room through reconnect.
export async function scannerCrew(page: Page, options: {
  status?: "setup" | "launched";
  memberId?: string | null;
  beforeRestore?: () => Promise<void>;
} = {}) {
  const store = new RoomStore();
  const created = store.apply({
    type: "create", crewName: "Scanner Survey", name: "Scout", capacity: 1,
    mission: catalogObjectives()[0], base: { x: 420, y: 420 },
    baseScenario: { version: 1, locationId: "jezero", seed: "scanner-crew-fixture" },
  });
  const code = created.snapshot.code;
  if (options.status !== "setup") store.apply({ type: "launch", code, expectedRevision: created.snapshot.revision }, created.token);
  const service = new RoomService(new LocalRoomCommandRepository(store, async () => {}));
  await page.addInitScript((saved) => {
    if (!sessionStorage.getItem("astronaut-guild-room")) sessionStorage.setItem("astronaut-guild-room", JSON.stringify(saved));
  }, { code, token: created.token });
  await page.routeWebSocket("**/api/sync", (socket) => {
    const session = { actorToken: null, roomCode: null };
    socket.onMessage(async (data) => {
      const command = JSON.parse(String(data)) as ClientCommand;
      if (command.type === "reconnect") await options.beforeRestore?.();
      const message = await service.handle(command, session);
      if (message.type === "accepted" && "memberId" in options) {
        socket.send(JSON.stringify({ ...message, memberId: options.memberId }));
      } else socket.send(JSON.stringify(message));
    });
  });
  return { code, snapshot: store.getSnapshot(code)! };
}

export function terrainRequests(page: Page) {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/data/jezero/")) requests.push(request.url());
  });
  return requests;
}
