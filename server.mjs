import { createServer } from "node:http";
import { join } from "node:path";
import next from "next";
import { WebSocket, WebSocketServer } from "ws";
import { RoomStore } from "./src/features/session/room-store.ts";
import { loadRooms, saveRooms } from "./src/features/session/file-store.ts";
import { LocalRoomCommandRepository, RoomService } from "./src/features/session/room-service.ts";

const development = process.env.NODE_ENV !== "production" && !process.argv.includes("--production");
const hostname = process.env.HOSTNAME ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3000);
const dataFile = process.env.ROOM_STORE_FILE ?? join(process.cwd(), ".data", "rooms.json");
const store = new RoomStore({ initialState: await loadRooms(dataFile) });
const sockets = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
let handler;
let writes = Promise.resolve();

function persist() {
  const state = store.exportState();
  writes = writes.catch(() => {}).then(() => saveRooms(dataFile, state));
  return writes;
}

const roomService = new RoomService(new LocalRoomCommandRepository(store, persist));

function handleUpgrade(request, socket, head) {
  const pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
  if (pathname === "/sync" || pathname === "/api/sync") {
    sockets.handleUpgrade(request, socket, head, (client) => sockets.emit("connection", client, request));
  } else if (!pathname.startsWith("/_next/")) {
    socket.destroy();
  }
}

const server = createServer((request, response) => handler(request, response));
server.on("upgrade", handleUpgrade);

// Next.js registers its own upgrade listener on the HTTP server during request
// setup. Give it an adapter that forwards only Next's HMR paths, so it cannot
// consume room socket upgrades as well.
const nextHttpServer = {
  on(event, listener) {
    if (event === "upgrade") {
      server.on("upgrade", (request, socket, head) => {
        const pathname = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
        if (pathname.startsWith("/_next/")) listener(request, socket, head);
      });
    } else {
      server.on(event, listener);
    }
    return server;
  },
};

const app = next({ dev: development, hostname, port, httpServer: nextHttpServer });
await app.prepare();
handler = app.getRequestHandler();

function send(socket, value) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(value));
}

function broadcast(code, snapshot) {
  for (const socket of sockets.clients) {
    if (socket.roomSession.roomCode === code) send(socket, { type: "snapshot", snapshot });
  }
}

sockets.on("connection", (socket) => {
  socket.roomSession = { actorToken: null, roomCode: null };
  let processing = Promise.resolve();
  let closed = false;

  socket.on("message", (bytes) => {
    processing = processing.then(async () => {
      if (closed) return;
      try {
        const command = JSON.parse(bytes.toString());
        const message = await roomService.handle(command, socket.roomSession);
        if (message.type === "disbanded") {
          for (const client of sockets.clients) {
            if (client === socket || client.roomSession.roomCode !== message.code) continue;
            send(client, message);
            client.roomSession.actorToken = null;
            client.roomSession.roomCode = null;
          }
          send(socket, message);
          return;
        }
        send(socket, message);
        if (message.type === "accepted") broadcast(message.snapshot.code, message.snapshot);
      } catch (error) {
        send(socket, { type: "error", code: "rejected", message: error instanceof Error ? error.message : "Invalid command" });
      }
    });
  });

  socket.on("close", () => {
    closed = true;
    void processing.then(async () => {
      if (!socket.roomSession.actorToken) return;
      const result = await roomService.disconnect(socket.roomSession);
      if (result) broadcast(result.snapshot.code, result.snapshot);
    }).catch((error) => console.error("Room persistence failed", error));
  });
});

server.listen(port, hostname, () => {
  console.log(`Astronaut Guild listening on http://${hostname}:${port}`);
});
