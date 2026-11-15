import type { HeightGrid } from "../mission/types";
import { sampleSlopeDeg } from "../terrain/spatial";
import { isCaution } from "../route/calculate-route";
import type { Hazard } from "./hazard-types";
export function buildSlopeHazards(grid: HeightGrid): Hazard[] {
  const width = grid.width - 1,
    height = grid.height - 1,
    steep = new Map<number, number>();
  for (let row = 0; row < height; row++)
    for (let col = 0; col < width; col++) {
      const slope = sampleSlopeDeg(grid, {
        x: grid.westM + (col + 0.5) * grid.cellSizeM,
        y: grid.northM - (row + 0.5) * grid.cellSizeM,
      });
      if (slope !== null && isCaution(slope))
        steep.set(row * width + col, slope);
    }
  const result: Hazard[] = [];
  for (const seed of [...steep.keys()]) {
    if (!steep.has(seed)) continue;
    const queue = [seed],
      cells: { westM: number; northM: number; sizeM: number }[] = [],
      slopes: number[] = [];
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor],
        slope = steep.get(index);
      if (slope === undefined) continue;
      steep.delete(index);
      const row = Math.floor(index / width),
        col = index % width;
      slopes.push(slope);
      cells.push({
        westM: grid.westM + col * grid.cellSizeM,
        northM: grid.northM - row * grid.cellSizeM,
        sizeM: grid.cellSizeM,
      });
      for (const [r, c] of [
        [row - 1, col],
        [row + 1, col],
        [row, col - 1],
        [row, col + 1],
      ])
        if (
          r >= 0 &&
          r < height &&
          c >= 0 &&
          c < width &&
          steep.has(r * width + c)
        )
          queue.push(r * width + c);
    }
    const center = cells[Math.floor(cells.length / 2)];
    result.push({
      id: `slope-${seed}`,
      category: "slope",
      title: `Steep terrain ${result.length + 1}`,
      severity: "warning",
      evidence: "Terrain-derived",
      marker: {
        x: center.westM + grid.cellSizeM / 2,
        y: center.northM - grid.cellSizeM / 2,
      },
      geometry: { kind: "cells", cells },
      slopeRangeDeg: [Math.min(...slopes), Math.max(...slopes)],
      description:
        "Connected terrain cells exceed the illustrative 15° slope threshold in the archived 8 m analysis grid.",
      risks: [
        "More demanding footing and a longer return climb. Small rocks and local ledges remain unresolved.",
      ],
      precautions: [
        "Review a lower-slope route and inspect the local terrain before approaching.",
      ],
      sources: ["https://hirise.lpl.arizona.edu/dtm/ESP_048842_1985"],
    });
  }
  return result.sort(
    (a, b) =>
      (b.geometry.kind === "cells" ? b.geometry.cells.length : 0) -
      (a.geometry.kind === "cells" ? a.geometry.cells.length : 0),
  );
}
