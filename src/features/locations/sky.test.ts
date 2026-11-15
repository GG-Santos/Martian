import { describe, expect, it } from "vitest";
import { constellationSegments, skyStars, starPosition } from "./sky";

describe("J2000 sky reference", () => {
  it("uses a substantial catalog of real stars rather than random coordinates", () => {
    expect(skyStars.length).toBeGreaterThan(5000);
    expect(skyStars.find((star) => star[4] === "Betelgeuse")?.[1]).toBeCloseTo(5.91953, 4);
  });

  it("places stars on a celestial sphere and connects known named stars", () => {
    const star = skyStars.find((entry) => entry[4] === "Acrux")!;
    expect(Math.hypot(...starPosition(star))).toBeCloseTo(80);
    expect(constellationSegments.filter((segment) => segment.name === "Orion").length).toBeGreaterThan(8);
    expect(constellationSegments.every(({ from, to }) => from[0] !== to[0])).toBe(true);
  });
});
