import type { HeightGrid, Manifest } from "../mission/types";

export type AnalysisMode = "none" | "slope" | "elevation" | "thermal";
export type ColorStop = { value: number; color: string };

export function getColorStops(
  mode: Exclude<AnalysisMode, "none">,
  manifest: Manifest,
  elevationRange = manifest.elevationRangeM,
): ColorStop[] {
  if (mode === "slope")
    return [
      { value: 0, color: "#183977" },
      { value: 10, color: "#5be1cf" },
      { value: 15, color: "#ffce63" },
      { value: 30, color: "#ea5048" },
    ];
  const [min, max] =
    mode === "thermal" ? manifest.thermalDnRange : elevationRange;
  const colors =
    mode === "thermal"
      ? ["#311466", "#e54871", "#fff08a"]
      : ["#254b83", "#55c6be", "#f4e9a0"];
  return [min, (min + max) / 2, max].map((value, i) => ({
    value,
    color: colors[i],
  }));
}

export function scalarValue(mode: "slope" | "thermal", value: number) {
  return mode === "slope"
    ? value === 255
      ? null
      : value / 4
    : value === 0
      ? null
      : value;
}

export function getElevationRange(grid: HeightGrid): [number, number] {
  let min = Infinity,
    max = -Infinity;
  for (const value of grid.values) {
    if (!Number.isFinite(value)) continue;
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return [min, max];
}
