import type { HeightGrid, LocalPoint } from "../mission/types";

type ColorStop = { value: number; rgb: readonly [number, number, number] };
export type RasterMode = "slope" | "thermal" | "topographic";
export type SurfaceScalars = {
  slope?: Uint8Array | null;
  thermal?: Uint8Array | null;
};
export const slopeStops: ColorStop[] = [
  { value: 0, rgb: [24, 57, 119] },
  { value: 10, rgb: [91, 225, 207] },
  { value: 15, rgb: [255, 206, 99] },
  { value: 30, rgb: [234, 80, 72] },
];

function scalarAt(
  grid: HeightGrid,
  index: number,
  mode: RasterMode,
  data: SurfaceScalars,
): number | null {
  if (mode === "topographic")
    return Number.isFinite(grid.values[index]) ? grid.values[index] : null;
  const value = data[mode]?.[index];
  return value === undefined || (mode === "slope" ? value === 255 : value === 0)
    ? null
    : mode === "slope"
      ? value / 4
      : value;
}

export function sampleSurfaceRaster(
  grid: HeightGrid,
  point: LocalPoint,
  mode: RasterMode,
  data: SurfaceScalars,
): number | null {
  const col = (point.x - grid.westM) / grid.cellSizeM;
  const row = (grid.northM - point.y) / grid.cellSizeM;
  if (
    ![col, row].every(Number.isFinite) ||
    col < 0 ||
    row < 0 ||
    col > grid.width - 1 ||
    row > grid.height - 1
  )
    return null;
  return scalarAt(
    grid,
    Math.round(row) * grid.width + Math.round(col),
    mode,
    data,
  );
}

export function surfaceRasterPixels(
  grid: HeightGrid,
  mode: RasterMode,
  data: SurfaceScalars,
  range: readonly [number, number],
): Uint8ClampedArray {
  const count = grid.width * grid.height;
  if (mode !== "topographic" && !data[mode])
    throw new Error(`${mode} raster unavailable`);
  if (
    grid.values.length !== count ||
    (mode !== "topographic" && data[mode]!.length !== count)
  )
    throw new Error("Raster grid size mismatch");
  const palette: ColorStop[] =
    mode === "slope"
      ? slopeStops
      : (mode === "thermal"
          ? [
              [42, 21, 72],
              [211, 73, 90],
              [255, 224, 143],
            ]
          : [
              [59, 78, 93],
              [126, 151, 141],
              [225, 202, 157],
            ]
        ).map((rgb, i) => ({
          value: range[0] + ((range[1] - range[0]) * i) / 2,
          rgb: rgb as [number, number, number],
        }));
  const pixels = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    const value = scalarAt(grid, i, mode, data);
    if (value === null) continue;
    const upperIndex = Math.max(
      1,
      palette.findIndex((stop) => stop.value >= value),
    );
    const upper =
      value > palette.at(-1)!.value ? palette.at(-1)! : palette[upperIndex];
    const lower =
      value > palette.at(-1)!.value ? upper : palette[upperIndex - 1];
    const t =
      upper.value === lower.value
        ? 0
        : Math.max(
            0,
            Math.min(1, (value - lower.value) / (upper.value - lower.value)),
          );
    for (let c = 0; c < 3; c++)
      pixels[i * 4 + c] = lower.rgb[c] + (upper.rgb[c] - lower.rgb[c]) * t;
    pixels[i * 4 + 3] = 255;
  }
  return pixels;
}
