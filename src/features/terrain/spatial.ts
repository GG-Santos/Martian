import type { HeightGrid, LocalPoint } from "../mission/types";
function cell(g: HeightGrid, p: LocalPoint) {
  const x = (p.x - g.westM) / g.cellSizeM,
    y = (g.northM - p.y) / g.cellSizeM;
  if (
    ![x, y].every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    x > g.width - 1 ||
    y > g.height - 1
  )
    return null;
  const col = Math.min(Math.floor(x), g.width - 2),
    row = Math.min(Math.floor(y), g.height - 2);
  const vals = [
    g.values[row * g.width + col],
    g.values[row * g.width + col + 1],
    g.values[(row + 1) * g.width + col],
    g.values[(row + 1) * g.width + col + 1],
  ];
  return vals.every(Number.isFinite) ? { u: x - col, v: y - row, vals } : null;
}
export function sampleHeight(g: HeightGrid, p: LocalPoint): number | null {
  const c = cell(g, p);
  if (!c) return null;
  const {
    u,
    v,
    vals: [a, b, c0, d],
  } = c;
  return a * (1 - u) * (1 - v) + b * u * (1 - v) + c0 * (1 - u) * v + d * u * v;
}
export function sampleSlopeDeg(g: HeightGrid, p: LocalPoint): number | null {
  const c = cell(g, p);
  if (!c) return null;
  const {
    u,
    v,
    vals: [a, b, c0, d],
  } = c;
  const dx = ((b - a) * (1 - v) + (d - c0) * v) / g.cellSizeM;
  const dy = ((c0 - a) * (1 - u) + (d - b) * u) / g.cellSizeM;
  return (Math.atan(Math.hypot(dx, dy)) * 180) / Math.PI;
}
export function toScene(
  p: LocalPoint,
  elevationM: number,
  g: HeightGrid,
): [number, number, number] {
  return [
    p.x - g.westM - ((g.width - 1) * g.cellSizeM) / 2,
    elevationM,
    -(p.y - g.northM + ((g.height - 1) * g.cellSizeM) / 2),
  ];
}
export function fromScene(x: number, z: number, g: HeightGrid): LocalPoint {
  return {
    x: x + g.westM + ((g.width - 1) * g.cellSizeM) / 2,
    y: g.northM - ((g.height - 1) * g.cellSizeM) / 2 - z,
  };
}
