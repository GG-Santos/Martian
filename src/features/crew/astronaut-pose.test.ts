import { expect, it } from "vitest";
import { solveLeg, crewDisplayAnchor, walkingMotion } from "./astronaut-pose";
it("places two articulated leg segments on the requested contact point", () => {
  for (const [down, forward] of [
    [0.94, 0],
    [0.8, 0.25],
    [0.7, -0.2],
  ]) {
    const pose = solveLeg(down, forward);
    const y = -0.5 * Math.cos(pose.hip) - 0.5 * Math.cos(pose.hip + pose.knee);
    const z = -0.5 * Math.sin(pose.hip) - 0.5 * Math.sin(pose.hip + pose.knee);
    expect(y).toBeCloseTo(-down, 6);
    expect(z).toBeCloseTo(forward, 6);
  }
});
it("keeps reduced-motion walking articulation static across the playback clock", () => {
  expect(walkingMotion("walking", true, 0)).toEqual(
    walkingMotion("walking", true, 5),
  );
  expect(walkingMotion("walking", true, 5)).toEqual({
    swing: 0,
    forward: 0,
    lift: 0,
  });
  expect(walkingMotion("walking", false, 0)).not.toEqual(
    walkingMotion("walking", false, 1),
  );
});
it("keeps enlarged crew symbols within the surface at route boundaries", () => {
  const grid = {
    width: 257,
    height: 257,
    cellSizeM: 8,
    westM: 0,
    northM: 2048,
    values: new Float32Array(257 ** 2),
  };
  for (const id of ["A1", "A2", "B1", "B2"] as const)
    for (const point of [
      { x: 0, y: 0 },
      { x: 2048, y: 2048 },
    ]) {
      const anchor = crewDisplayAnchor(point, id, grid);
      expect(anchor.x).toBeGreaterThanOrEqual(0);
      expect(anchor.x).toBeLessThanOrEqual(2048);
      expect(anchor.y).toBeGreaterThanOrEqual(0);
      expect(anchor.y).toBeLessThanOrEqual(2048);
    }
});
