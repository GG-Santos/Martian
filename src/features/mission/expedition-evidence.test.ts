import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { validateEvidence } from "./expedition-evidence";

const packaged = JSON.parse(
  readFileSync(
    new URL(
      "../../../public/data/jezero/expedition-evidence.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

describe("atmospheric evidence validation", () => {
  it("keeps the archived observations and their missing wind values", () => {
    const result = validateEvidence(packaged);
    expect(result.weather?.rows).toHaveLength(8);
    expect(result.weather?.rows[1].windMps).toBeNull();
    expect(result.regional).not.toBeNull();
  });
  it.each([
    { rows: [] },
    { rows: [{ ...packaged.weather.rows[0], hour: 25 }] },
    { rows: [packaged.weather.rows[0], packaged.weather.rows[0]] },
  ])(
    "rejects unusable time bins without discarding regional evidence",
    ({ rows }) => {
      const result = validateEvidence({
        ...packaged,
        weather: { ...packaged.weather, rows },
      });
      expect(result.weather).toBeNull();
      expect(result.regional).not.toBeNull();
    },
  );
});
