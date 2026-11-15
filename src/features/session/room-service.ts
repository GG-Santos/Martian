import type { ApplyResult, ClientCommand, RoomSnapshot, ServerMessage } from "./protocol.ts";
import { ReconnectRejected, RoomStore, type PersistedRooms } from "./room-store.ts";
import { RedisRoomRepository, type RoomRealtimeEvent } from "./redis-room-repository.ts";

export type RoomConnectionState = {
  actorToken: string | null;
  roomCode: string | null;
};

export interface RoomCommandRepository {
  checkRoomCode(code: string): Promise<"available" | "full" | "invalid">;
  apply(command: ClientCommand, actorToken?: string): Promise<ApplyResult>;
  disband(command: Extract<ClientCommand, { type: "disband" }>, actorToken?: string): Promise<{ code: string }>;
  disconnect(actorToken: string): Promise<ApplyResult | null>;
  publish(roomCode: string, snapshot: RoomSnapshot): Promise<void>;
  publishDisbanded(roomCode: string): Promise<void>;
  subscribe(handler: (event: RoomRealtimeEvent) => void): Promise<() => Promise<void>>;
}

export class LocalRoomCommandRepository implements RoomCommandRepository {
  private readonly store: RoomStore;
  private readonly persist: () => Promise<void>;
  private pending: Promise<void> = Promise.resolve();

  constructor(store: RoomStore, persist: () => Promise<void>) {
    this.store = store;
    this.persist = persist;
  }

  async checkRoomCode(code: string) {
    await this.pending;
    return this.store.checkRoomCode(code);
  }

  async apply(command: ClientCommand, actorToken?: string) {
    return this.update(() => this.store.apply(command, actorToken));
  }

  async disband(command: Extract<ClientCommand, { type: "disband" }>, actorToken?: string) {
    return this.update(() => this.store.disband(command, actorToken));
  }

  async disconnect(actorToken: string) {
    return this.update(() => this.store.disconnect(actorToken));
  }

  private update<T>(operation: () => T): Promise<T> {
    // Persistence covers the entire store, so commands in every room share this queue.
    const next = this.pending.then(async () => {
      const before = this.store.exportState();
      try {
        const result = operation();
        if (result !== null) await this.persist();
        return result;
      } catch (error) {
        this.store.restoreState(before);
        throw error;
      }
    });
    // A failed write must not poison subsequent commands, including a reconnect retry.
    this.pending = next.then(() => {}, () => {});
    return next;
  }

  async publish() {}

  async publishDisbanded() {}

  async subscribe(_handler: (event: RoomRealtimeEvent) => void) {
    return async () => {};
  }
}

export class RedisRoomCommandRepository implements RoomCommandRepository {
  private readonly repository: RedisRoomRepository;
  private readonly maxAttempts: number;

  constructor(repository: RedisRoomRepository, maxAttempts = 5) {
    this.repository = repository;
    this.maxAttempts = maxAttempts;
  }

  async checkRoomCode(code: string) {
    const current = await this.repository.read();
    return this.makeStore(current.state).checkRoomCode(code);
  }

  async apply(command: ClientCommand, actorToken?: string) {
    const result = await this.update((store) => store.apply(command, actorToken));
    if (!result) throw new Error("Room command did not produce a result");
    return result;
  }

  async disband(command: Extract<ClientCommand, { type: "disband" }>, actorToken?: string) {
    const result = await this.update((store) => store.disband(command, actorToken));
    if (!result) throw new Error("Crew disband did not produce a result");
    return result;
  }

  async disconnect(actorToken: string) {
    return this.update((store) => store.disconnect(actorToken));
  }

  publish(roomCode: string, snapshot: RoomSnapshot) {
    return this.repository.publish(roomCode, snapshot);
  }

  publishDisbanded(roomCode: string) {
    return this.repository.publishDisbanded(roomCode);
  }

  subscribe(handler: (event: RoomRealtimeEvent) => void) {
    return this.repository.subscribe(handler);
  }

  private async update<T>(operation: (store: RoomStore) => T | null): Promise<T | null> {
    for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
      const current = await this.repository.read();
      const store = this.makeStore(current.state);
      const result = operation(store);
      if (!result) return null;
      if (await this.repository.compareAndSet(current.version, store.exportState())) return result;
    }
    throw new Error("Crew room changed repeatedly while processing this update. Please try again.");
  }

  private makeStore(state: PersistedRooms): RoomStore {
    return new RoomStore({ initialState: state, resetConnectionsOnRestore: false });
  }
}

export class RoomService {
  private readonly repository: RoomCommandRepository;

  constructor(repository: RoomCommandRepository) {
    this.repository = repository;
  }

  subscribe(handler: (event: RoomRealtimeEvent) => void) {
    return this.repository.subscribe(handler);
  }

  async handle(input: unknown, connection: RoomConnectionState): Promise<ServerMessage> {
    if (!input || typeof input !== "object" || typeof (input as { type?: unknown }).type !== "string") {
      throw new Error("Invalid command");
    }
    const command = input as { type: string; code?: unknown };
    if (command.type === "check-room") {
      const code = typeof command.code === "string" ? command.code.trim().toUpperCase() : "";
      const validCode = /^[A-Z0-9]{6}$/.test(code);
      return {
        type: "room-check",
        code,
        status: validCode ? await this.repository.checkRoomCode(code) : "invalid",
      };
    }

    if (connection.actorToken && ["create", "join", "reconnect"].includes(command.type)) {
      throw new Error("This connection already belongs to a room");
    }
    if (!connection.actorToken && !["create", "join", "reconnect"].includes(command.type)) {
      throw new Error("Connect to a room first");
    }

    if (command.type === "disband") {
      const result = await this.repository.disband(input as Extract<ClientCommand, { type: "disband" }>, connection.actorToken ?? undefined);
      connection.actorToken = null;
      connection.roomCode = null;
      try {
        await this.repository.publishDisbanded(result.code);
      } catch (error) {
        console.error("Crew disband notification failed after room state was saved", error instanceof Error ? error.message : "Unknown error");
      }
      return { type: "disbanded", code: result.code };
    }

    let result: ApplyResult;
    try {
      result = await this.repository.apply(input as ClientCommand, connection.actorToken ?? undefined);
    } catch (error) {
      if (command.type === "reconnect" && error instanceof ReconnectRejected) {
        return { type: "error", code: error.code, message: error.message };
      }
      throw error;
    }
    if (result.token) connection.actorToken = result.token;
    connection.roomCode = result.snapshot.code;

    const response: ServerMessage = {
      type: "accepted",
      snapshot: result.snapshot,
      memberId: result.memberId ?? "",
      ...(result.token ? { token: result.token } : {}),
    };

    if (command.type === "leave") {
      connection.actorToken = null;
      connection.roomCode = null;
    }

    try {
      await this.repository.publish(result.snapshot.code, result.snapshot);
    } catch (error) {
      console.error("Crew snapshot publish failed after room state was saved", error instanceof Error ? error.message : "Unknown error");
    }
    return response;
  }

  async disconnect(connection: RoomConnectionState): Promise<ApplyResult | null> {
    const token = connection.actorToken;
    connection.actorToken = null;
    connection.roomCode = null;
    if (!token) return null;

    const result = await this.repository.disconnect(token);
    if (result) {
      try {
        await this.repository.publish(result.snapshot.code, result.snapshot);
      } catch (error) {
        console.error("Crew disconnect snapshot publish failed after room state was saved", error instanceof Error ? error.message : "Unknown error");
      }
    }
    return result;
  }
}
