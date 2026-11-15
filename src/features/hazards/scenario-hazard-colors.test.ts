import { describe, expect, it } from "vitest";
import { scenarioHazardColors } from "./scenario-hazard-colors";

describe("crew scenario hazard colors", () => {
  it("keeps the map palette aligned with the crew planning colors", () => {
    expect(scenarioHazardColors).toEqual({
      heat: "#f0a060",
      dust: "#e4cb85",
      chemical: "#8cc5a9",
      radiation: "#d99bc1",
      rockfall: "#d58b73",
      storm: "#b7a2e6",
    });
  });
});
