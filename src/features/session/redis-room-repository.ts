import Redis, { type Redis as RedisClient } from "ioredis";
import type { RoomSnapshot } from "./protocol";
import type { PersistedRooms } from "./room-store";

export type RoomRealtimeEvent =
  | { type: "snapshot"; roomCode: string; snapshot: RoomSnapshot }
  | { type: "disbanded"; roomCode: string };
type VersionedRooms = { version: number; state: PersistedRooms };
type RoomEventListener = (event: RoomRealtimeEvent) => void;

const readScript = `
  local version = redis.call("HGET", KEYS[1], "version")
  local state = redis.call("HGET", KEYS[1], "state")
  return { version or "0", state or "" }
`;

const compareAndSetScript = `
  local current = redis.call("HGET", KEYS[1], "version")
  if not current then current = "0" end
  if tonumber(current) ~= tonumber(ARGV[1]) then return 0 end
  redis.call("HSET", KEYS[1], "version", tostring(tonumber(ARGV[1]) + 1), "state", ARGV[2])
  return 1
`;

function isPersistedRooms(value: unknown): value is PersistedRooms {
  if (!value || typeof value !== "object" || !Array.isArray((value as { rooms?: unknown }).rooms)) return false;
  return (value as { rooms: unknown[] }).rooms.every((room) => {
    if (!room || typeof room !== "object") return false;
    const record = room as { code?: unknown; members?: unknown };
    return typeof record.code === "string" && Array.isArray(record.members);
  });
}

function getDeploymentNamespace(): string {
  const value = process.env.VERCEL_ENV ?? (process.env.NODE_ENV === "production" ? "production" : "development");
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export class RedisRoomRepository {
  private readonly redis: RedisClient;
  private readonly stateKey: string;
  private readonly eventsChannel: string;
  private subscriber: RedisClient | null = null;
  private subscriberPromise: Promise<RedisClient> | null = null;
  private readonly listeners = new Set<RoomEventListener>();

  constructor(url: string, namespace = getDeploymentNamespace()) {
    this.redis = new Redis(url, { maxRetriesPerRequest: 2, connectTimeout: 5_000 });
    this.stateKey = `astronaut-guild:${namespace}:rooms:v1`;
    this.eventsChannel = `astronaut-guild:${namespace}:room-events:v1`;
  }

  async read(): Promise<VersionedRooms> {
    const value = await this.redis.eval(readScript, 1, this.stateKey) as [string, string];
    const version = Number(value[0]);
    if (!Number.isSafeInteger(version) || version < 0) throw new Error("Invalid Redis room-store version");
    if (!value[1]) {
      if (version !== 0) throw new Error("Redis room store is missing its state payload");
      return { version: 0, state: { rooms: [] } };
    }

    let state: unknown;
    try {
      state = JSON.parse(value[1]);
    } catch {
      throw new Error("Redis room store contains invalid JSON");
    }
    if (!isPersistedRooms(state)) throw new Error("Redis room store has an invalid shape");
    return { version, state };
  }

  async compareAndSet(expectedVersion: number, nextState: PersistedRooms): Promise<boolean> {
    if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) throw new Error("Invalid expected room-store version");
    if (!isPersistedRooms(nextState)) throw new Error("Refusing to persist an invalid room-store state");
    const result = await this.redis.eval(compareAndSetScript, 1, this.stateKey, expectedVersion, JSON.stringify(nextState));
    return result === 1;
  }

  async publish(roomCode: string, snapshot: RoomSnapshot): Promise<void> {
    await this.publishEvent({ type: "snapshot", roomCode, snapshot });
  }

  async publishDisbanded(roomCode: string): Promise<void> {
    await this.publishEvent({ type: "disbanded", roomCode });
  }

  async subscribe(handler: RoomEventListener): Promise<() => Promise<void>> {
    const listener: RoomEventListener = (event) => handler(event);
    this.listeners.add(listener);
    try {
      await this.ensureSubscriber();
    } catch (error) {
      this.listeners.delete(listener);
      throw error;
    }

    let active = true;
    return async () => {
      if (!active) return;
      active = false;
      this.listeners.delete(listener);
      if (this.listeners.size !== 0 || !this.subscriber) return;
      const subscriber = this.subscriber;
      this.subscriber = null;
      try {
        await subscriber.quit();
      } catch {
        subscriber.disconnect();
      }
    };
  }

  private async publishEvent(event: RoomRealtimeEvent): Promise<void> {
    await this.redis.publish(this.eventsChannel, JSON.stringify(event));
  }

  private notifyListeners(event: RoomRealtimeEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("Crew event listener failed", error instanceof Error ? error.message : "Unknown error");
      }
    }
  }

  private async ensureSubscriber(): Promise<RedisClient> {
    if (this.subscriber) return this.subscriber;
    if (this.subscriberPromise) return this.subscriberPromise;

    const url = process.env.REDIS_URL;
    if (!url) throw new Error("REDIS_URL is required for Vercel crew connections");
    const subscriber = new Redis(url, { maxRetriesPerRequest: null, connectTimeout: 5_000 });
    subscriber.on("message", (channel, message) => {
      if (channel !== this.eventsChannel) return;
      let event: unknown;
      try {
        event = JSON.parse(message);
      } catch {
        return;
      }
      if (!event || typeof event !== "object") return;
      const record = event as { type?: unknown; roomCode?: unknown; snapshot?: unknown };
      if (typeof record.roomCode !== "string") return;
      if (record.type === "disbanded") {
        this.notifyListeners({ type: "disbanded", roomCode: record.roomCode });
        return;
      }
      if (record.type !== "snapshot" || !record.snapshot || typeof record.snapshot !== "object") return;
      const snapshot = record.snapshot as RoomSnapshot;
      if (snapshot.code !== record.roomCode || typeof snapshot.revision !== "number") return;
      this.notifyListeners({ type: "snapshot", roomCode: record.roomCode, snapshot });
    });

    this.subscriberPromise = (async () => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<never>((_resolve, reject) => {
        timeoutId = setTimeout(() => {
          subscriber.disconnect();
          reject(new Error("Timed out connecting to crew update notifications"));
        }, 8_000);
      });
      try {
        await Promise.race([subscriber.subscribe(this.eventsChannel), timeout]);
        this.subscriber = subscriber;
        return subscriber;
      } catch (error) {
        subscriber.disconnect();
        throw error;
      } finally {
        if (timeoutId) clearTimeout(timeoutId);
        this.subscriberPromise = null;
      }
    })();
    return this.subscriberPromise;
  }
}

let repository: RedisRoomRepository | null = null;

export function getRedisRoomRepository(): RedisRoomRepository {
  const url = process.env.REDIS_URL;
  if (!url) throw new Error("REDIS_URL is required for Vercel crew connections");
  repository ??= new RedisRoomRepository(url);
  return repository;
}
