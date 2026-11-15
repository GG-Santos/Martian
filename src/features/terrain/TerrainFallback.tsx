export function TerrainFallback({ reason }: { reason: string }) {
  return (
    <div className="terrain-fallback">
      <img
        src="/data/jezero/overview.webp"
        alt="North-up HiRISE overview of the 2.048 kilometer Jezero patch"
      />
      <div className="fallback-note">
        <h2>Terrain overview</h2>
        <p>{reason}</p>
        <p>North is up · 2.048 km across · NASA/JPL-Caltech/UArizona/USGS</p>
        <p>
          Preset: habitat → A → B → C → habitat. Interactive editing requires
          the terrain data and WebGL.
        </p>
        <a href="/data/jezero/manifest.json">Read dataset sources</a>
      </div>
    </div>
  );
}
