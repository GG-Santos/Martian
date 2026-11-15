import { describe, expect, it } from "vitest";
import { sampleAvatarMotion } from "./avatar-motion";

describe("avatar motion", () => {
  it("gives a choice change a visible hop and arm gesture before settling", () => {
    const reacting = sampleAvatarMotion(1.25, 1, false);
    const settled = sampleAvatarMotion(2.25, 1, false);
    expect(reacting.hop).toBeGreaterThan(0.1);
    expect(reacting.armLift).toBeGreaterThan(0.4);
    expect(Math.abs(reacting.turn)).toBeGreaterThan(0.1);
    expect(settled.hop).toBe(0);
    expect(settled.armLift).toBe(0);
  });

  it("restarts the reaction from the newest choice", () => {
    expect(sampleAvatarMotion(2.25, 2, false).armLift).toBeGreaterThan(0.4);
    expect(sampleAvatarMotion(2.25, 1, false).armLift).toBe(0);
  });

  it("holds a still pose for reduced motion", () => {
    expect(sampleAvatarMotion(1.25, 1, true)).toEqual({ hop: 0, turn: 0, armLift: 0, breath: 1, blink: 1 });
  });
});
