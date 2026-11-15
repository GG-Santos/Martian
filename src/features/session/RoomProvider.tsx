"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { ClientCommand, ExpeditionPlan, RoomCodeAvailability, RoomSnapshot, ServerMessage } from "./protocol";
import type { AvatarConfig } from "../avatar/avatar-types";
import type { LocalPoint } from "../mission/types";
import type { Quest } from "../quests/quest-types";
import { advanceSimulationClock, simulationStepSol } from "../mission/simulation-clock";
import { simulationDuration } from "../mission/simulation-duration";

type RoomContextValue = {
  snapshot: RoomSnapshot | null;
  restoringRoom: boolean;
  memberId: string | null;
  connection: "connecting" | "online" | "offline";
  error: string;
  roomCodeAvailability: { code: string; status: RoomCodeAvailability } | null;
  create: (crewName: string, name: string, role: string | undefined, avatar: AvatarConfig, mission: Quest, base: LocalPoint, capacity: number, baseScenarioSeed: string) => void;
  join: (code: string, name: string, role?: string, avatar?: AvatarConfig) => void;
  checkRoomCode: (code: string) => void;
  send: (command: ClientCommand) => void;
  setExpeditionPlan: (code: string, expectedRevision: number, plan: ExpeditionPlan) => void;
  leave: () => void;
  disband: () => void;
  clearError: () => void;
};

const RoomContext = createContext<RoomContextValue | null>(null);
const storageKey = "astronaut-guild-room";

export function RoomProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot | null>(null);
  const [restoringRoom, setRestoringRoom] = useState(true);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [connection, setConnection] = useState<RoomContextValue["connection"]>("connecting");
  const [error, setError] = useState("");
  const [roomCodeAvailability, setRoomCodeAvailability] = useState<RoomContextValue["roomCodeAvailability"]>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const snapshotRef = useRef<RoomSnapshot | null>(null);
  const ignoredRoomRef = useRef<string | null>(null);

  useEffect(() => {
    let active = true;
    let retryDelay = 1_000;
    let retryTimer: number | null = null;

    function savedRoom(): { code: string; token: string } | null {
      try {
        const saved = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null");
        if (typeof saved?.code === "string" && saved.code && typeof saved.token === "string" && saved.token)
          return { code: saved.code, token: saved.token };
      } catch {
        // Storage may be unavailable or contain a stale value.
      }
      return null;
    }

    const connect = () => {
      if (!active) return;
      const scheme = window.location.protocol === "https:" ? "wss:" : "ws:";
      const socket = new WebSocket(`${scheme}//${window.location.host}/api/sync`);
      let reconnecting = false;
      socketRef.current = socket;
      setConnection("connecting");

      socket.onopen = () => {
        if (!active) return;
        setConnection("online");
        setError("");
        const saved = savedRoom();
        if (saved) {
          reconnecting = true;
          socket.send(JSON.stringify({ type: "reconnect", ...saved }));
        } else {
          retryDelay = 1_000;
          setRestoringRoom(false);
        }
      };
      socket.onmessage = (event) => {
        if (!active) return;
        let message: ServerMessage;
        try { message = JSON.parse(event.data) as ServerMessage; }
        catch { setError("Could not read the crew update."); return; }
        if (message.type === "room-check") { setRoomCodeAvailability({ code: message.code, status: message.status }); return; }
        if (message.type === "error") {
          if (reconnecting) {
            reconnecting = false;
            if (message.code === "invalid-reconnect-token" || message.code === "room-not-found") {
              window.sessionStorage.removeItem(storageKey);
              snapshotRef.current = null;
              setSnapshot(null);
              setMemberId(null);
              setRestoringRoom(false);
            } else {
              setError("Crew reconnect failed. Retrying automatically.");
              socket.close();
              return;
            }
          }
          setError(message.message);
          return;
        }
        if (message.type === "disbanded") {
          if (snapshotRef.current?.code !== message.code) return;
          ignoredRoomRef.current = message.code;
          window.sessionStorage.removeItem(storageKey);
          snapshotRef.current = null;
          setSnapshot(null);
          setMemberId(null);
          return;
        }
        if (message.snapshot.code === ignoredRoomRef.current && !(message.type === "accepted" && message.token)) return;
        if (message.type === "accepted" && message.token) ignoredRoomRef.current = null;
        const current = snapshotRef.current;
        const staleForCurrentRoom = current?.code === message.snapshot.code && message.snapshot.revision < current.revision;
        if (!staleForCurrentRoom) {
          snapshotRef.current = message.snapshot;
          setSnapshot(message.snapshot);
        }
        if (message.type === "accepted") {
          reconnecting = false;
          retryDelay = 1_000;
          setRestoringRoom(false);
          if (message.memberId) setMemberId(message.memberId);
          if (message.token) window.sessionStorage.setItem(storageKey, JSON.stringify({ code: message.snapshot.code, token: message.token }));
          setError("");
        }
      };
      socket.onerror = () => {
        if (active) setError("Crew connection failed. Retrying automatically.");
      };
      socket.onclose = () => {
        if (!active) return;
        if (socketRef.current === socket) socketRef.current = null;
        setConnection("offline");
        retryTimer = window.setTimeout(connect, retryDelay);
        retryDelay = Math.min(retryDelay * 2, 30_000);
      };
    };

    // With no saved session there is nothing to restore, even while offline.
    queueMicrotask(() => {
      if (active && !savedRoom()) setRestoringRoom(false);
    });
    connect();
    return () => {
      active = false;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, []);

  const send = useCallback((command: ClientCommand) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      setError("Crew connection is offline. Reload to reconnect.");
      return;
    }
    setError("");
    socket.send(JSON.stringify(command));
  }, []);
  const roomCode = snapshot?.code;
  const simulation = snapshot?.simulation;
  const isCaptain = snapshot?.members.some((member) => member.id === memberId && member.isHost) ?? false;
  const launched = snapshot?.status === "launched";
  useEffect(() => {
    if (!roomCode || !launched || !isCaptain || restoringRoom || connection !== "online" || !simulation?.playing) return;
    const timer = window.setInterval(() => {
      const current = snapshotRef.current;
      if (current?.code !== roomCode || !current.simulation.playing) return;
      const duration = simulationDuration(current.missionId, current.simulation);
      if (!duration) return;
      const next = advanceSimulationClock(current.simulation, { type: "step", deltaSol: simulationStepSol }, duration);
      const deltaSol = next.elapsedSol - current.simulation.elapsedSol;
      if (deltaSol > 0) send({ type: "advance-simulation", code: roomCode, expectedRevision: current.revision, deltaSol });
    }, 1800);
    return () => window.clearInterval(timer);
  }, [roomCode, launched, isCaptain, restoringRoom, connection, simulation?.playing, send]);
  const checkRoomCode = useCallback((code: string) => {
    const normalizedCode = code.trim().toUpperCase();
    const socket = socketRef.current;
    setRoomCodeAvailability({ code: normalizedCode, status: "checking" });
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ type: "check-room", code: normalizedCode }));
  }, []);
  const leave = useCallback(() => {
    const current = snapshotRef.current;
    ignoredRoomRef.current = current?.code ?? null;
    if (current) send({ type: "leave", code: current.code, expectedRevision: current.revision });
    window.sessionStorage.removeItem(storageKey);
    snapshotRef.current = null;
    setSnapshot(null);
    setMemberId(null);
  }, [send]);
  const disband = useCallback(() => {
    const current = snapshotRef.current;
    if (current) send({ type: "disband", code: current.code, expectedRevision: current.revision });
  }, [send]);
  return (
    <RoomContext.Provider value={{
      snapshot, restoringRoom, memberId, connection, error, roomCodeAvailability,
      create: (crewName, name, role, avatar, mission, base, capacity, seed) => send({ type: "create", crewName, name, role, avatar, mission, base, capacity, baseScenario: { version: 1, locationId: mission.datasetId, seed } }),
      join: (code, name, role, avatar) => send({ type: "join", code, name, role, avatar }),
      checkRoomCode,
      setExpeditionPlan: (code, expectedRevision, plan) => send({ type: "set-expedition-plan", code, expectedRevision, plan }),
      send, leave, disband, clearError: () => setError(""),
    }}>
      {children}
    </RoomContext.Provider>
  );
}

export function useRoom() {
  const value = useContext(RoomContext);
  if (!value) throw new Error("useRoom must be used inside RoomProvider");
  return value;
}
