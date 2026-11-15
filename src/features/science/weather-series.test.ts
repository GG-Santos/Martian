import { describe, expect, it } from "vitest";
import { weatherSeries } from "./weather-series";
import type { WeatherArchive } from "../mission/expedition-evidence";

describe("archived atmospheric chart", () => {
  it("retains missing wind as a line break and uses LMST hour spacing", () => {
    const weather = {
      rows: [
        { hour: 6, windMps: 1.7 },
        { hour: 0, windMps: 2.2 },
        { hour: 3, windMps: null },
        { hour: 9, windMps: 2.1 },
      ],
    } as WeatherArchive;
    const series = weatherSeries(weather, "windMps");
    expect(series.segments).toEqual([
      [{ hour: 0, value: 2.2 }],
      [
        { hour: 6, value: 1.7 },
        { hour: 9, value: 2.1 },
      ],
    ]);
    expect(series.rows[1].windMps).toBeNull();
    expect(weather.rows[0].hour).toBe(6);
  });
  it("keeps a missing channel empty instead of inventing zero measurements", () => {
    expect(
      weatherSeries(
        { rows: [{ hour: 0, windMps: null }] } as WeatherArchive,
        "windMps",
      ).segments,
    ).toEqual([]);
  });
});
