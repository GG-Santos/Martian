import type { RoutePreference } from "../mission/mission-plan";
import type { Hazard } from "../hazards/hazard-types";
import type { HeightGrid, LocalPoint } from "../mission/types";
import { pointInHazard } from "../hazards/hazard-geometry";
import { sampleSlopeDeg } from "../terrain/spatial";

type Cell = { x: number; y: number; id: number };

class MinHeap {
  private values: { id: number; priority: number }[] = [];

  push(value: { id: number; priority: number }) {
    this.values.push(value);
    let index = this.values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (this.values[parent].priority <= value.priority) break;
      this.values[index] = this.values[parent];
      index = parent;
    }
    this.values[index] = value;
  }

  pop() {
    const first = this.values[0];
    const last = this.values.pop();
    if (!first || !last || this.values.length === 0) return first ?? null;
    let index = 0;
    while (index * 2 + 1 < this.values.length) {
      let child = index * 2 + 1;
      if (child + 1 < this.values.length && this.values[child + 1].priority < this.values[child].priority) child++;
      if (this.values[child].priority >= last.priority) break;
      this.values[index] = this.values[child];
      index = child;
    }
    this.values[index] = last;
    return first;
  }
}

function simplify(points: LocalPoint[]): LocalPoint[] {
  if (points.length < 3) return points;
  const result = [points[0]];
  let previousDx = Math.sign(points[1].x - points[0].x);
  let previousDy = Math.sign(points[1].y - points[0].y);
  for (let index = 1; index < points.length - 1; index++) {
    const dx = Math.sign(points[index + 1].x - points[index].x);
    const dy = Math.sign(points[index + 1].y - points[index].y);
    const a = points[index - 1], b = points[index], c = points[index + 1];
    const crossProduct = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (dx !== previousDx || dy !== previousDy || crossProduct !== 0) result.push(b);
    previousDx = dx;
    previousDy = dy;
  }
  result.push(points.at(-1)!);
  return result;
}

type PathWeights = { slope: number; hazard: number };

const routeWeights: Record<RoutePreference, PathWeights> = {
  efficient: { slope: 0.2, hazard: 0.01 },
  "lower-exposure": { slope: 2, hazard: 1.5 },
};

function searchTerrainLeg(
  grid: HeightGrid,
  start: LocalPoint,
  objective: LocalPoint,
  hazards: Hazard[],
  weights: PathWeights,
): LocalPoint[] | null {
  const { width, height, cellSizeM } = grid;
  if (width < 2 || height < 2 || !Number.isFinite(cellSizeM) || cellSizeM <= 0) return null;
  const eastM = grid.westM + (width - 1) * cellSizeM;
  const southM = grid.northM - (height - 1) * cellSizeM;
  const toCell = (point: LocalPoint): Cell | null => {
    if (point.x < grid.westM || point.x > eastM || point.y < southM || point.y > grid.northM) return null;
    const x = Math.round((point.x - grid.westM) / cellSizeM);
    const y = Math.round((grid.northM - point.y) / cellSizeM);
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x >= width || y >= height) return null;
    return { x, y, id: y * width + x };
  };
  const startCell = toCell(start), goalCell = toCell(objective);
  if (!startCell || !goalCell || sampleSlopeDeg(grid, start) === null || sampleSlopeDeg(grid, objective) === null) return null;
  const pointAt = (cell: Cell): LocalPoint => ({
    x: grid.westM + cell.x * cellSizeM,
    y: grid.northM - cell.y * cellSizeM,
  });
  const samePoint = (a: LocalPoint, b: LocalPoint) => a.x === b.x && a.y === b.y;
  const midpoint = (a: LocalPoint, b: LocalPoint): LocalPoint => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  // Each connector stays within one cell, and each grid step crosses one cell.
  const startCenter = pointAt(startCell), goalCenter = pointAt(goalCell);
  if (sampleSlopeDeg(grid, midpoint(start, startCenter)) === null
    || sampleSlopeDeg(grid, midpoint(objective, goalCenter)) === null
    || sampleSlopeDeg(grid, startCenter) === null
    || sampleSlopeDeg(grid, goalCenter) === null) return null;
  const count = width * height;
  const slopes = new Float32Array(count).fill(Number.NaN);
  const hazardCosts = new Float32Array(count).fill(Number.NaN);
  const slopeAt = (cell: Cell) => {
    let value = slopes[cell.id];
    if (Number.isNaN(value)) {
      value = sampleSlopeDeg(grid, pointAt(cell)) ?? Number.POSITIVE_INFINITY;
      slopes[cell.id] = value;
    }
    return value;
  };
  const hazardCostAt = (cell: Cell) => {
    let value = hazardCosts[cell.id];
    if (Number.isNaN(value)) {
      const point = pointAt(cell);
      value = hazards.reduce((cost, hazard) => cost + (pointInHazard(point, hazard) ? hazard.severity === "warning" ? 30 : 8 : 0), 0);
      hazardCosts[cell.id] = value;
    }
    return value;
  };
  const slopePenalty = (slope: number) => Math.pow(Math.max(0, slope - 10) / 5, 2);
  const costs = new Float64Array(count).fill(Number.POSITIVE_INFINITY);
  const parents = new Int32Array(count).fill(-1);
  const closed = new Uint8Array(count);
  const open = new MinHeap();
  const heuristic = (cell: Cell) => Math.hypot(cell.x - goalCell.x, cell.y - goalCell.y) * cellSizeM;
  costs[startCell.id] = 0;
  open.push({ id: startCell.id, priority: heuristic(startCell) });
  const offsets = [-1, 0, 1];
  while (true) {
    const currentEntry = open.pop();
    if (!currentEntry) return null;
    const currentId = currentEntry.id;
    if (closed[currentId]) continue;
    closed[currentId] = 1;
    if (currentId === goalCell.id) break;
    const current: Cell = { x: currentId % width, y: Math.floor(currentId / width), id: currentId };
    const currentSlope = slopeAt(current);
    if (!Number.isFinite(currentSlope)) continue;
    for (const dy of offsets) for (const dx of offsets) {
      if (dx === 0 && dy === 0) continue;
      const x = current.x + dx, y = current.y + dy;
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const next: Cell = { x, y, id: y * width + x };
      if (closed[next.id]) continue;
      const nextSlope = slopeAt(next);
      if (!Number.isFinite(nextSlope)) continue;
      const distance = cellSizeM * (dx !== 0 && dy !== 0 ? Math.SQRT2 : 1);
      const midpointPoint = midpoint(pointAt(current), pointAt(next));
      if (sampleSlopeDeg(grid, midpointPoint) === null) continue;
      const crossingCost = hazards.reduce((cost, hazard) => cost + (pointInHazard(midpointPoint, hazard) ? hazard.severity === "warning" ? 30 : 8 : 0), 0);
      const edgeCost = distance * (1 + weights.slope * (slopePenalty(currentSlope) + slopePenalty(nextSlope)) / 2
        + weights.hazard * ((hazardCostAt(current) + hazardCostAt(next)) / 2 + crossingCost));
      const candidate = costs[currentId] + edgeCost;
      if (candidate >= costs[next.id]) continue;
      costs[next.id] = candidate;
      parents[next.id] = currentId;
      open.push({ id: next.id, priority: candidate + heuristic(next) });
    }
  }
  const cellPath: Cell[] = [];
  for (let id = goalCell.id; id !== -1; id = parents[id]) {
    cellPath.push({ x: id % width, y: Math.floor(id / width), id });
    if (id === startCell.id) break;
  }
  if (cellPath.at(-1)?.id !== startCell.id) return null;
  cellPath.reverse();
  const points = [start, ...cellPath.map(pointAt), objective];
  return simplify(points.filter((point, index) => index === 0 || !samePoint(point, points[index - 1])));
}

export function findTerrainAwareLeg(
  grid: HeightGrid,
  start: LocalPoint,
  goal: LocalPoint,
  hazards: Hazard[],
  preference: RoutePreference,
): LocalPoint[] | null {
  return searchTerrainLeg(grid, start, goal, hazards, routeWeights[preference]);
}

export function findTerrainAwarePath(
  grid: HeightGrid,
  start: LocalPoint,
  objective: LocalPoint,
  hazards: Hazard[],
): LocalPoint[] | null {
  const oneWay = searchTerrainLeg(grid, start, objective, hazards, { slope: 1, hazard: 1 });
  return oneWay ? [...oneWay, ...oneWay.slice(0, -1).reverse()] : null;
}
