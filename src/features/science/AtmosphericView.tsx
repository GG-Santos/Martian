"use client";

import { useEffect, useMemo, useState } from "react";
import type { Manifest } from "../mission/types";
import type {
  ExpeditionEvidence,
  WeatherArchive,
  WeatherKey,
} from "../mission/expedition-evidence";
import { loadExpeditionEvidence } from "../mission/load-mission";
import { weatherSeries } from "./weather-series";

const channels = [
  {
    id: "temperatureC",
    label: "Air temperature",
    unit: "°C",
    color: "#e9b28b",
  },
  { id: "pressurePa", label: "Pressure", unit: "Pa", color: "#bbd8c8" },
  { id: "windMps", label: "Wind speed", unit: "m/s", color: "#9dc5de" },
] as const;

export function AtmosphericView({ manifest }: { manifest: Manifest }) {
  const [request, setRequest] = useState(0);
  const [loaded, setLoaded] = useState<{
    request: number;
    evidence: ExpeditionEvidence;
  } | null>(null);
  useEffect(() => {
    let active = true;
    void loadExpeditionEvidence("/data/jezero", manifest).then((evidence) => {
      if (active) setLoaded({ request, evidence });
    });
    return () => {
      active = false;
    };
  }, [manifest, request]);
  const current = loaded?.request === request ? loaded.evidence : null;
  if (!current)
    return <p role="status">Verifying the packaged atmospheric record…</p>;
  if (!current.weather)
    return (
      <div className="science-empty" role="status">
        <h3>Atmospheric samples unavailable</h3>
        <p>
          The weather archive failed verification or contains no supported
          measurements.
        </p>
        <button onClick={() => setRequest((value) => value + 1)}>
          Retry weather archive
        </button>
      </div>
    );
  return <WeatherPlot weather={current.weather} />;
}

function WeatherPlot({ weather }: { weather: WeatherArchive }) {
  const [channel, setChannel] = useState<WeatherKey>("temperatureC");
  const [hour, setHour] = useState(weather.rows[0]?.hour ?? 0);
  const selected = channels.find((item) => item.id === channel)!;
  const series = useMemo(
    () => weatherSeries(weather, channel),
    [weather, channel],
  );
  const row = series.rows.find((row) => row.hour === hour) ?? series.rows[0];
  const x = (hour: number) => 64 + (hour / 24) * 534;
  const y = (value: number) =>
    218 - ((value - series.min) / (series.max - series.min)) * 184;
  return (
    <section className="science-weather" aria-label="Atmospheric observations">
      <header>
        <div>
          <h2>Jezero’s daily atmosphere</h2>
          <p>
            MEDA · Sol {weather.sol} · {weather.sourceTime}
          </p>
        </div>
        <span className="science-scope">Archived rover samples</span>
      </header>
      <p className="science-coverage">
        {weather.location} These eight time bins are a rover time series, not a
        spatial weather map or a forecast for this expedition.
      </p>
      <div
        className="science-channel-tabs"
        role="group"
        aria-label="Atmospheric measurement"
      >
        {channels.map((item) => (
          <button
            key={item.id}
            aria-pressed={channel === item.id}
            onClick={() => setChannel(item.id)}
          >
            {item.label}
            <small>{item.unit}</small>
          </button>
        ))}
      </div>
      <div className="science-weather-layout">
        <figure className="science-weather-chart">
          <svg
            viewBox="0 0 640 270"
            role="img"
            aria-label={`${selected.label} by local mean solar time, ${selected.unit}; missing samples are gaps`}
          >
            {[0, 1, 2, 3, 4].map((i) => {
              const value = series.min + ((series.max - series.min) * i) / 4;
              return (
                <g key={i}>
                  <line
                    x1={64}
                    x2={598}
                    y1={y(value)}
                    y2={y(value)}
                    stroke="#34414a"
                  />
                  <text x={54} y={y(value) + 4} textAnchor="end">
                    {value.toFixed(channel === "pressurePa" ? 0 : 1)}
                  </text>
                </g>
              );
            })}
            {[0, 3, 6, 9, 12, 15, 18, 21, 24].map((hour) => (
              <text key={hour} x={x(hour)} y={239} textAnchor="middle">
                {String(hour).padStart(2, "0")}
              </text>
            ))}
            <text x={64} y={18}>
              {selected.unit}
            </text>
            <text x={330} y={264} textAnchor="middle">
              Local mean solar time (hours)
            </text>
            {series.segments.map((segment, i) => (
              <polyline
                key={i}
                points={segment
                  .map((p) => `${x(p.hour)},${y(p.value)}`)
                  .join(" ")}
                stroke={selected.color}
                strokeWidth={2}
                fill="none"
              />
            ))}
            {row && (
              <line
                x1={x(row.hour)}
                x2={x(row.hour)}
                y1={32}
                y2={218}
                stroke="#a6b8bf"
                strokeDasharray="3 5"
              />
            )}
            {series.rows.map((row) =>
              row[channel] === null ? (
                <text
                  key={row.hour}
                  x={x(row.hour)}
                  y={208}
                  textAnchor="middle"
                  className="science-missing"
                >
                  No sample
                </text>
              ) : (
                <circle
                  key={row.hour}
                  cx={x(row.hour)}
                  cy={y(row[channel]!)}
                  r={row.hour === hour ? 5 : 3.5}
                  fill={selected.color}
                >
                  <title>
                    {String(row.hour).padStart(2, "0")}:00 LMST · {row[channel]}{" "}
                    {selected.unit} · {row.times[channel]}
                  </title>
                </circle>
              ),
            )}
          </svg>
          <figcaption>
            Lines connect adjacent reported bins only. Gaps remain missing;
            values are not interpolated.
          </figcaption>
        </figure>
        <aside className="science-reading">
          <h3>Read a time bin</h3>
          <label>
            Local time
            <select
              aria-label="Atmospheric time bin"
              value={hour}
              onChange={(event) => setHour(Number(event.target.value))}
            >
              {series.rows.map((row) => (
                <option key={row.hour} value={row.hour}>
                  {String(row.hour).padStart(2, "0")}:00 LMST
                </option>
              ))}
            </select>
          </label>
          <dl>
            {channels.map((item) => (
              <div key={item.id}>
                <dt>{item.label}</dt>
                <dd>
                  {row?.[item.id] === null || row?.[item.id] === undefined
                    ? "Unavailable"
                    : `${row[item.id]!.toFixed(2)} ${item.unit}`}
                </dd>
                <small>{row?.times[item.id] ?? "No valid source sample"}</small>
              </div>
            ))}
          </dl>
        </aside>
      </div>
      <details className="science-provenance">
        <summary>Sample table, source products and quality</summary>
        <div className="science-table-scroll">
          <table>
            <caption>Packaged Sol {weather.sol} observations</caption>
            <thead>
              <tr>
                <th>LMST bin</th>
                {channels.map((c) => (
                  <th key={c.id}>
                    {c.label} ({c.unit})
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.rows.map((row) => (
                <tr key={row.hour}>
                  <th>{String(row.hour).padStart(2, "0")}:00</th>
                  {channels.map((c) => (
                    <td key={c.id}>
                      {row[c.id] === null
                        ? "Unavailable"
                        : row[c.id]!.toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          {weather.timeBasis}. {weather.method}
        </p>
        <p>{weather.quality}</p>
        {weather.products.map((product) => (
          <p key={product.file}>
            <a href={product.url} target="_blank" rel="noreferrer">
              {product.file}
            </a>{" "}
            ·{" "}
            <a href={product.label} target="_blank" rel="noreferrer">
              PDS label
            </a>
            <small>{product.productId}</small>
          </p>
        ))}
      </details>
    </section>
  );
}
