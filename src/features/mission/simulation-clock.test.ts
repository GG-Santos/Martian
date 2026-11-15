import { describe, expect, it } from "vitest";
import { advanceSimulationClock } from "./simulation-clock";

const selected = { scenarioId: "test", startLs: 155, elapsedSol: 0.5, playing: true };

describe("simulation clock", () => {
  it("bounds explicit forward and backward steps to scenario duration", () => {
    expect(advanceSimulationClock(selected, { type: "step", deltaSol: 20 }, 2)).toEqual({ ...selected, elapsedSol: 2, playing: false });
    expect(advanceSimulationClock(selected, { type: "step", deltaSol: -2 }, 2)).toEqual({ ...selected, elapsedSol: 0 });
    expect(advanceSimulationClock(selected, { type: "step", deltaSol: NaN }, 2)).toEqual(selected);
  });

  it("pauses without stepping, permits explicit stepping while paused, and resets to the beginning", () => {
    const paused = advanceSimulationClock(selected, { type: "pause" }, 2);
    expect(paused).toEqual({ ...selected, playing: false });
    expect(advanceSimulationClock(paused, { type: "step", deltaSol: 0.25 }, 2)).toEqual({ ...paused, elapsedSol: 0.75 });
    expect(advanceSimulationClock(paused, { type: "play" }, 2)).toEqual(selected);
    expect(advanceSimulationClock(selected, { type: "reset" }, 2)).toEqual({ ...selected, elapsedSol: 0, playing: false });
  });
});
