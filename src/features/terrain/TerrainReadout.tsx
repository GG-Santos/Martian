import type { inspectTerrain } from "./inspect-terrain";
export function TerrainReadout({
  reading,
}: {
  reading: ReturnType<typeof inspectTerrain>;
}) {
  const format = (n: number | null, digits = 1) =>
    n === null ? "Unavailable" : n.toFixed(digits);
  return (
    <div className="terrain-readout" aria-label="Terrain readings">
      <dl className="quest-stats">
        <div>
          <dt>Elevation · Mars 2000</dt>
          <dd>{format(reading.elevationM)} m</dd>
        </div>
        <div>
          <dt>Slope · 8 m analysis</dt>
          <dd>{format(reading.slopeDeg)}°</dd>
        </div>
        <div>
          <dt>THEMIS · ~100 m source</dt>
          <dd>
            {reading.thermalDn === null
              ? "Unavailable"
              : `${reading.thermalDn} DN`}
          </dd>
        </div>
      </dl>
    </div>
  );
}
