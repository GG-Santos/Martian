import type { RouteSample } from "../mission/types";
export function ElevationProfile({
  samples,
  focusedSample,
  onSampleFocus,
}: {
  samples: RouteSample[];
  focusedSample: number | null;
  onSampleFocus: (i: number | null) => void;
}) {
  const min = Math.min(...samples.map((s) => s.elevationM)),
    max = Math.max(...samples.map((s) => s.elevationM)),
    total = samples.at(-1)?.distanceM || 1;
  const xy = (s: RouteSample) =>
    `${((s.distanceM / total) * 600).toFixed(2)},${(85 - ((s.elevationM - min) / Math.max(1, max - min)) * 65).toFixed(2)}`;
  const path = samples
    .filter((_, i) => i % 3 === 0 || i === samples.length - 1)
    .map(xy)
    .join(" ");
  const f = focusedSample === null ? null : samples[focusedSample];
  return (
    <section className="elevation-profile" aria-label="Route elevation profile">
      <div className="profile-heading">
        <h2>Along the route</h2>
        <span>
          {Math.round(min)} to {Math.round(max)} m · Mars datum
        </span>
      </div>
      <div className="profile-chart">
        <svg
          viewBox="0 0 600 105"
          role="img"
          aria-label={`Elevation profile for ${(total / 1000).toFixed(2)} kilometers, including return`}
          onPointerMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect(),
              d =
                Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) *
                total;
            let idx = 0;
            for (let i = 1; i < samples.length; i++)
              if (
                Math.abs(samples[i].distanceM - d) <
                Math.abs(samples[idx].distanceM - d)
              )
                idx = i;
            onSampleFocus(idx);
          }}
          onPointerLeave={() => onSampleFocus(null)}
        >
          <line x1="0" x2="600" y1="85" y2="85" stroke="#3a4b4d" />
          <polygon points={`0,85 ${path} 600,85`} fill="#a3ddd615" />
          <polyline
            points={path}
            fill="none"
            stroke="#a3ddd6"
            strokeWidth="1.5"
          />
          {f && (
            <line
              x1={(f.distanceM / total) * 600}
              x2={(f.distanceM / total) * 600}
              y1="10"
              y2="90"
              stroke="#f2bb65"
              strokeDasharray="3 3"
            />
          )}
          <text x="0" y="102" fill="#a4b3b4" fontSize="10">
            Habitat / 0 km
          </text>
          <text x="600" y="102" fill="#a4b3b4" fontSize="10" textAnchor="end">
            Return / {(total / 1000).toFixed(2)} km
          </text>
        </svg>
      </div>
      <label className="profile-scrubber">
        Inspect profile
        <input
          type="range"
          aria-label="Inspect route elevation"
          min="0"
          max={samples.length - 1}
          value={focusedSample ?? 0}
          onChange={(e) => onSampleFocus(Number(e.target.value))}
          onBlur={() => onSampleFocus(null)}
        />
        <span aria-live="polite">
          {f
            ? `${Math.round(f.distanceM)} m along route · ${Math.round(f.elevationM)} m elevation`
            : "Hover or use the slider to locate a point."}
        </span>
      </label>
    </section>
  );
}
