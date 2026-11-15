export type SimulationState = {
  scenarioId: string | null;
  startLs: number;
  elapsedSol: number;
  playing: boolean;
};

export type SimulationClockAction =
  | { type: "step"; deltaSol: number }
  | { type: "play" }
  | { type: "pause" }
  | { type: "reset" };

export const simulationStepSol = 0.5;

export const initialSimulationState: SimulationState = {
  scenarioId: null,
  startLs: 0,
  elapsedSol: 0,
  playing: false,
};

export function advanceSimulationClock(
  state: SimulationState, action: SimulationClockAction, durationSol: number,
): SimulationState {
  const duration = state.scenarioId !== null && Number.isFinite(durationSol) ? Math.max(0, durationSol) : 0;
  const prior = Number.isFinite(state.elapsedSol) ? state.elapsedSol : 0;
  const delta = action.type === "step" && Number.isFinite(action.deltaSol) ? action.deltaSol : 0;
  const elapsedSol = action.type === "reset" ? 0 : Math.min(duration, Math.max(0, prior + delta));
  const playing = elapsedSol < duration && (action.type === "play" || (action.type === "step" && state.playing));
  return { ...state, elapsedSol, playing };
}
