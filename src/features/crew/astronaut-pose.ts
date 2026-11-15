export function solveLeg(down: number, forward: number) {
  const distance = Math.max(0.05, Math.min(0.999, Math.hypot(down, forward)));
  const bend = Math.acos(distance);
  return { hip: -Math.atan2(forward, down) - bend, knee: 2 * bend };
}
import type { HeightGrid, LocalPoint } from "../mission/types";
import type { CrewId } from "./crew-timeline";
import type { CrewActivity } from "./crew-timeline";
export function walkingMotion(
  activity: CrewActivity,
  reducedMotion: boolean,
  phase: number,
) {
  if (reducedMotion || activity !== "walking")
    return { swing: 0, forward: 0, lift: 0 };
  return {
    swing: Math.sin(phase) * 0.42,
    forward: Math.sin(phase) * 0.24,
    lift: Math.max(0, Math.cos(phase)) * 0.1,
  };
}
export function crewDisplayAnchor(
  point: LocalPoint,
  id: CrewId,
  grid: HeightGrid,
): LocalPoint {
  const east = grid.westM + (grid.width - 1) * grid.cellSizeM,
    south = grid.northM - (grid.height - 1) * grid.cellSizeM;
  return {
    x: Math.max(
      grid.westM,
      Math.min(east, point.x + (id.endsWith("1") ? -7 : 7)),
    ),
    y: Math.max(
      south,
      Math.min(grid.northM, point.y + (id.startsWith("A") ? 10 : -10)),
    ),
  };
}
