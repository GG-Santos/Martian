import type {
  WeatherArchive,
  WeatherKey,
} from "../mission/expedition-evidence";

/** Gaps break the line; no interpolation is applied to missing samples. */
export function weatherSeries(weather: WeatherArchive, key: WeatherKey) {
  const rows = [...weather.rows].sort((a, b) => a.hour - b.hour);
  const values = rows.flatMap((row) => (row[key] === null ? [] : [row[key]]));
  if (!values.length)
    return {
      rows,
      segments: [] as { hour: number; value: number }[][],
      min: 0,
      max: 1,
    };
  const min = Math.min(...values),
    max = Math.max(...values);
  const padding = Math.max((max - min) * 0.12, 0.5);
  const segments: { hour: number; value: number }[][] = [];
  let current: { hour: number; value: number }[] = [];
  for (const row of rows) {
    const value = row[key];
    if (value === null) {
      if (current.length) segments.push(current);
      current = [];
    } else current.push({ hour: row.hour, value });
  }
  if (current.length) segments.push(current);
  return { rows, segments, min: min - padding, max: max + padding };
}
