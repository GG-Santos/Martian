import { useEffect, useState } from "react";
import type { Manifest } from "./types";
import type {
  ExpeditionEvidence as Evidence,
  RegionalEvidence,
  WeatherArchive,
  WeatherKey,
} from "./expedition-evidence";
import { loadExpeditionEvidence } from "./load-mission";
export function ExpeditionEvidence({ manifest }: { manifest: Manifest }) {
  const [evidence, setEvidence] = useState<Evidence | null>(null);
  useEffect(() => {
    let active = true;
    void loadExpeditionEvidence("/data/jezero", manifest).then((data) => {
      if (active) setEvidence(data);
    });
    return () => {
      active = false;
    };
  }, [manifest]);
  return (
    <section
      className="expedition-evidence"
      aria-label="Archived mission context"
    >
      <h2>Mission archive</h2>
      <details open>
        <summary>Archived Jezero weather</summary>
        {evidence === null ? (
          <p>Loading archive…</p>
        ) : evidence.weather ? (
          <Weather weather={evidence.weather} />
        ) : (
          <p>Weather archive unavailable. Route planning remains available.</p>
        )}
      </details>
      <details open>
        <summary>Regional rover context</summary>
        {evidence?.regional ? (
          <Regional regional={evidence.regional} />
        ) : (
          <p>
            {evidence === null
              ? "Loading regional record…"
              : "Regional archive unavailable."}
          </p>
        )}
      </details>
    </section>
  );
}
function Weather({ weather }: { weather: WeatherArchive }) {
  const [showTimes, setShowTimes] = useState(false);
  const keys: WeatherKey[] = ["temperatureC", "pressurePa", "windMps"];
  return (
    <div className="archive-weather">
      <div className="archive-sol">
        SOL {weather.sol}
        <span>{weather.sourceTime}</span>
      </div>
      <p className="fine">{weather.location}</p>
      <table>
        <caption>MEDA calibrated samples · LMST bins</caption>
        <thead>
          <tr>
            <th>LMST</th>
            <th>Air °C</th>
            <th>Pa</th>
            <th>Wind m/s</th>
          </tr>
        </thead>
        <tbody>
          {weather.rows.map((row) => (
            <tr key={row.hour}>
              <th scope="row">{String(row.hour).padStart(2, "0")}:00</th>
              {keys.map((key) => (
                <td key={key} title={row.times[key] ?? "No valid sample"}>
                  {row[key] === null
                    ? "—"
                    : row[key].toFixed(key === "pressurePa" ? 1 : 2)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fine">— Unavailable. {weather.method}</p>
      <button
        className="archive-times"
        aria-expanded={showTimes}
        onClick={() => setShowTimes(!showTimes)}
      >
        Sample times & source products
      </button>
      {showTimes && (
        <div className="archive-source">
          <p>
            {weather.timeBasis}. {weather.quality}
          </p>
          {weather.rows.map((row) => (
            <div key={row.hour}>
              <strong>{String(row.hour).padStart(2, "0")}:00 bin</strong>
              {keys.map((key) => (
                <small key={key}>
                  {key} · {row.times[key] ?? "Unavailable"}
                </small>
              ))}
            </div>
          ))}
          {weather.products.map((p) => (
            <p key={p.file}>
              <a href={p.url} target="_blank" rel="noreferrer">
                {p.file} ↗
              </a>
              <small>{p.productId}</small>
              <small>
                {p.sourceStart} → {p.sourceEnd}
              </small>
              <a href={p.label} target="_blank" rel="noreferrer">
                PDS label ↗
              </a>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
function Regional({ regional }: { regional: RegionalEvidence }) {
  const points = [
    ...regional.patch,
    ...regional.traverse.flatMap((t) => t.points),
  ];
  const west = Math.min(...points.map((p) => p[0])) - 350,
    north = Math.max(...points.map((p) => p[1])) + 350;
  const span =
    Math.max(
      Math.max(...points.map((p) => p[0])) - west,
      north - Math.min(...points.map((p) => p[1])),
    ) + 350;
  const xy = (p: number[]) => [
    20 + ((p[0] - west) / span) * 280,
    20 + ((north - p[1]) / span) * 280,
  ];
  const path = (pts: number[][]) => pts.map((p) => xy(p).join(",")).join(" ");
  const first = xy(regional.traverse[0].points[0]);
  const lastLeg = regional.traverse.at(-1)!;
  const last = xy(lastLeg.points.at(-1)!);
  const patch = xy([1024, 1024]);
  return (
    <figure className="regional-inset">
      <svg
        viewBox="0 0 320 320"
        role="img"
        aria-label="Archived Perseverance traverse west of the playable patch, registered in the same Mars coordinate frame"
      >
        <defs>
          <pattern
            id="regional-grid"
            width="20"
            height="20"
            patternUnits="userSpaceOnUse"
          >
            <path
              d="M20 0H0V20"
              fill="none"
              stroke="#35414b"
              strokeWidth=".5"
            />
          </pattern>
        </defs>
        <rect width="320" height="320" fill="#101820" />
        <rect width="320" height="320" fill="url(#regional-grid)" />
        {regional.traverse.map((leg, i) => (
          <polyline
            key={i}
            points={path(leg.points)}
            fill="none"
            stroke="#b4c8d4"
            strokeWidth="1.5"
          />
        ))}
        <polygon
          points={path(regional.patch)}
          fill="#91cdbc"
          fillOpacity=".13"
          stroke="#a5e2cc"
          strokeDasharray="4 3"
        />
        <circle cx={first[0]} cy={first[1]} r="3" fill="#d9e8f0" />
        <circle cx={last[0]} cy={last[1]} r="4" fill="#eab87b" />
        <text
          x={patch[0]}
          y={patch[1]}
          textAnchor="middle"
          fill="#c5f3e2"
          fontSize="10"
        >
          PLAYABLE PATCH
        </text>
        <text x="285" y="20" fill="#d5e3ef" fontSize="10">
          N ↑
        </text>
        <text x="15" y="310" fill="#a9bac8" fontSize="9">
          {(((span / 280) * 50) / 1000).toFixed(1)} km
        </text>
        <path d="M15 295h50" stroke="#b9ccd8" />
      </svg>
      <figcaption>
        <span>
          White · traverse / Amber · rover at sol {lastLeg.sol}
          <br />
          Mint · 2.048 km playable patch
        </span>
        <p>
          {regional.dateRange}
          <br />
          {regional.credit}
        </p>
        <a href={regional.source} target="_blank" rel="noreferrer">
          Archived traverse source ↗
        </a>
        <a href={regional.threeForks.url} target="_blank" rel="noreferrer">
          {regional.threeForks.title} ↗
        </a>
        <p>{regional.threeForks.date}</p>
        <small>{regional.registration}</small>
      </figcaption>
    </figure>
  );
}
