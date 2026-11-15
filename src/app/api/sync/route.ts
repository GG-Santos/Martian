import { upgradeWebSocket, type WebSocket as VercelWebSocket, type WebSocketData } from "@vercel/functions";
import { WebSocket } from "ws";
import { getRedisRoomRepository, type RoomRealtimeEvent } from "@/features/session/redis-room-repository";
import { RedisRoomCommandRepository, RoomService, type RoomConnectionState } from "@/features/session/room-service";
import type { ServerMessage } from "@/features/session/protocol";

export const runtime = "nodejs";
export const maxDuration = 300;

const localSockets = new Map<VercelWebSocket, RoomConnectionState>();
let roomService: RoomService | null = null;
let unsubscribeFromRooms: (() => Promise<void>) | null = null;
let subscriptionPromise: Promise<void> | null = null;

function getRoomService(): RoomService {
  roomService ??= new RoomService(new RedisRoomCommandRepository(getRedisRoomRepository()));
  return roomService;
}

function send(socket: VercelWebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

function broadcast(event: RoomRealtimeEvent): void {
  for (const [socket, session] of localSockets) {
    if (session.roomCode !== event.roomCode) continue;
    if (event.type === "snapshot") {
      send(socket, { type: "snapshot", snapshot: event.snapshot });
    } else {
      send(socket, { type: "disbanded", code: event.roomCode });
      session.actorToken = null;
      session.roomCode = null;
    }
  }
}

async function ensureRoomSubscription(): Promise<void> {
  if (unsubscribeFromRooms) return;
  if (!subscriptionPromise) {
    subscriptionPromise = getRoomService().subscribe(broadcast).then((unsubscribe) => {
      unsubscribeFromRooms = unsubscribe;
    }).finally(() => {
      subscriptionPromise = null;
    });
  }
  await subscriptionPromise;
}

async function releaseRoomSubscription(): Promise<void> {
  if (localSockets.size !== 0) return;
  await subscriptionPromise?.catch(() => {});
  if (localSockets.size !== 0 || !unsubscribeFromRooms) return;
  const unsubscribe = unsubscribeFromRooms;
  unsubscribeFromRooms = null;
  await unsubscribe();
}

function decodeFrame(data: WebSocketData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString("utf8");
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString("utf8");
  return data.toString("utf8");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Invalid command";
}

export function GET(): Promise<Response> {
  return upgradeWebSocket((socket) => {
    const session: RoomConnectionState = { actorToken: null, roomCode: null };
    localSockets.set(socket, session);

    let closed = false;
    let cleanupStarted = false;
    let processing = Promise.resolve();

    const cleanup = () => {
      if (cleanupStarted) return;
      cleanupStarted = true;
      closed = true;
      localSockets.delete(socket);
      void processing.finally(async () => {
        try {
          await getRoomService().disconnect(session);
        } catch (error) {
          console.error("Crew disconnect failed", errorMessage(error));
        }
        try {
          await releaseRoomSubscription();
        } catch (error) {
          console.error("Crew subscription cleanup failed", errorMessage(error));
        }
      });
    };

    socket.on("message", (data: WebSocketData) => {
      processing = processing.then(async () => {
        if (closed) return;
        try {
          await ensureRoomSubscription();
          const command: unknown = JSON.parse(decodeFrame(data));
          const message = await getRoomService().handle(command, session);
          send(socket, message);
        } catch (error) {
          send(socket, { type: "error", code: "rejected", message: errorMessage(error) });
        }
      });
    });
    socket.on("close", cleanup);
    socket.on("error", cleanup);
  }, { maxPayload: 16 * 1024 });
}
