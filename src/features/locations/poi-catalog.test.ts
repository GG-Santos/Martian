import { describe, expect, it } from "vitest";
import { getMarsPoi, marsPois } from "./poi-catalog";

describe("Mars atlas points", () => {
  it("covers many IAU-named places with coordinates and direct Gazetteer citations", () => {
    expect(marsPois.length).toBeGreaterThan(40);
    const olympus = getMarsPoi("usgs-olympus-mons");
    expect(olympus.latitude).toBeCloseTo(18.6528);
    expect(olympus.longitude).toBeCloseTo(226.1975);
    expect(olympus.factSource).toMatch(/planetarynames\.wr\.usgs\.gov\/Feature\/\d+/);
    expect(new Set(marsPois.map((point) => point.id)).size).toBe(marsPois.length);
  });
});
