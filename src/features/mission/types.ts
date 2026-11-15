export type LocalPoint = { x: number; y: number };
export type HeightGrid = {
  width: number;
  height: number;
  cellSizeM: number;
  westM: number;
  northM: number;
  values: Float32Array;
};
export type StopId = "A" | "B" | "C";
export type DetailTile = {
  stopId: StopId;
  asset: string;
  grid: Omit<HeightGrid, "values">;
};
export type RouteNode = {
  id: string;
  point: LocalPoint;
  kind: "start" | "end" | "stop" | "waypoint";
  stopId?: StopId;
};
export type Assumptions = {
  speedMps: number;
  allowanceMin: number;
  dwellMin: number;
};
export type RouteSample = LocalPoint & {
  elevationM: number;
  distanceM: number;
  slopeDeg: number;
};
export type RouteSummary = {
  distanceM: number;
  ascentM: number;
  durationMin: number;
  remainingMin: number;
  samples: RouteSample[];
};
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
export type RouteState = {
  nodes: RouteNode[];
  presetNodes: RouteNode[];
  includedStopIds: StopId[];
  assumptions: Assumptions;
};
export type RouteAction =
  | { type: "insert"; afterNodeId: string; id: string; point: LocalPoint }
  | { type: "move"; id: string; point: LocalPoint }
  | { type: "remove"; id: string }
  | { type: "reorder"; id: string; direction: -1 | 1 }
  | { type: "set-stop-included"; stopId: StopId; included: boolean }
  | { type: "set-assumptions"; assumptions: Assumptions }
  | { type: "reset" };
export type LayerId = "optical" | "slope" | "thermal";
export type LayerSource = {
  id: LayerId;
  category: string;
  mission: string;
  instrument: string;
  productId: string;
  reference: string;
  credit: string;
  acquired: string | null;
  units: string;
  nativeResolutionM: number;
  outputResolutionM: number;
  status: string;
  dateNote?: string;
};
export type SiteCoverage = {
  kind: "route-grade" | "limited";
  datasetId: string | null;
  reason: string;
};
export type Manifest = {
  datasetId: string;
  coverage: SiteCoverage;
  grid: Omit<HeightGrid, "values">;
  reliefGrid?: Omit<HeightGrid, "values">;
  detailTiles?: DetailTile[];
  scalarGrid?: { width: number; height: number };
  bounds: { westM: number; eastM: number; southM: number; northM: number };
  sourceCrs: string;
  localTransform: { eastingOriginM: number; northingOriginM: number };
  center: { longitude: number; latitude: number };
  elevationRangeM: [number, number];
  slopeRangeDeg: [number, number];
  thermalDnRange: [number, number];
  verticalDatum: string;
  layers: LayerSource[];
  assets: Record<string, string>;
  processing: string;
};
export type ScienceStop = {
  id: StopId;
  title: string;
  point: LocalPoint;
  question: string;
  context: string;
  references: string[];
  image?: string;
  imageContext: "local" | "regional";
  imageCredit?: string;
};
export type MissionData = {
  datasetId: string;
  title: string;
  brief: string;
  regionalContext: string;
  stops: ScienceStop[];
  presetNodes: RouteNode[];
  grid: HeightGrid;
  manifest: Manifest;
};
