import { describe, expect, it } from "vitest";
import { catalogObjectives } from "./catalog-objectives";

describe("catalog objectives", () => {
  it("provides a varied set of uniquely identified hypothetical missions", () => {
    const objectives = catalogObjectives();
    expect(objectives.length).toBeGreaterThanOrEqual(12);
    expect(new Set(objectives.map(q => q.id)).size).toBe(objectives.length);
    expect(new Set(objectives.map(q => q.difficulty)).size).toBeGreaterThan(1);
    expect(objectives.every(q => q.provenance.includes("hypothetical") && q.expectedObservations && q.completionCriteria)).toBe(true);
  });
});
