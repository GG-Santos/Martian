import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomBytes } from "node:crypto";
import type { PersistedRooms } from "./room-store";

export async function loadRooms(path: string): Promise<PersistedRooms> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    if (!parsed || typeof parsed !== "object" || !Array.isArray((parsed as PersistedRooms).rooms)) {
      throw new Error("Invalid room store");
    }
    return parsed as PersistedRooms;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { rooms: [] };
    throw error;
  }
}

export async function saveRooms(path: string, state: PersistedRooms): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    await writeFile(temporary, JSON.stringify(state), { encoding: "utf8", mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}
