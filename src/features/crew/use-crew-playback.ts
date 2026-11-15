"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  crewMembers,
  expeditionDuration,
  sampleCrew,
  type TeamTimeline,
} from "./crew-timeline";
export type CrewClock = { timeSec: number; playing: boolean };
export function useCrewPlayback(
  timelines: TeamTimeline[],
  routeRevision: string,
) {
  const durationSec = expeditionDuration(timelines);
  const clockRef = useRef<CrewClock>({ timeSec: 0, playing: false });
  const [timeSec, setTime] = useState(0),
    [playing, setPlaying] = useState(false),
    [rate, setRate] = useState<1 | 20 | 60>(20),
    [resetReason, setReason] = useState("");
  const previousRevision = useRef(routeRevision);
  const pause = useCallback(() => {
    clockRef.current.playing = false;
    setPlaying(false);
    setTime(clockRef.current.timeSec);
  }, []);
  const restart = useCallback((reason = "") => {
    clockRef.current = { timeSec: 0, playing: false };
    setTime(0);
    setPlaying(false);
    setReason(reason);
  }, []);
  useEffect(() => {
    if (previousRevision.current === routeRevision) return;
    previousRevision.current = routeRevision;
    queueMicrotask(() => restart("Route changed — playback restarted"));
  }, [routeRevision, restart]);
  useEffect(() => {
    if (!playing) return;
    let frame = 0,
      last = performance.now(),
      lastText = last;
    function tick(now: number) {
      const clock = clockRef.current;
      if (!clock.playing) return;
      clock.timeSec = Math.min(
        durationSec,
        clock.timeSec + (Math.max(0, now - last) / 1000) * rate,
      );
      last = now;
      if (now - lastText >= 200 || clock.timeSec >= durationSec) {
        setTime(clock.timeSec);
        lastText = now;
      }
      if (clock.timeSec >= durationSec) {
        clock.playing = false;
        setPlaying(false);
        return;
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing, rate, durationSec]);
  const states = useMemo(
    () =>
      crewMembers.map((member) =>
        sampleCrew(
          timelines.find((t) => t.teamId === member.teamId)!,
          member,
          timeSec,
        ),
      ),
    [timelines, timeSec],
  );
  function play() {
    if (durationSec <= 0) return;
    if (clockRef.current.timeSec >= durationSec) {
      clockRef.current.timeSec = 0;
      setTime(0);
    }
    clockRef.current.playing = true;
    setPlaying(true);
    setReason("");
  }
  function seek(value: number) {
    pause();
    const next = Number.isFinite(value)
      ? Math.max(0, Math.min(durationSec, value))
      : 0;
    clockRef.current.timeSec = next;
    setTime(next);
    setReason("");
  }
  return {
    timeSec,
    playing,
    rate,
    durationSec,
    states,
    clockRef,
    play,
    pause,
    restart,
    seek,
    setRate,
    resetReason,
  };
}
export type CrewPlayback = ReturnType<typeof useCrewPlayback>;
