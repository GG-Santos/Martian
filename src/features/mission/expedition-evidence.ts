export type WeatherKey = "temperatureC" | "pressurePa" | "windMps";
export type WeatherArchive = {
  sol: number;
  location: string;
  sourceTime: string;
  timeBasis: string;
  method: string;
  quality: string;
  units: Record<WeatherKey, string>;
  products: {
    channel: string;
    productId: string;
    file: string;
    url: string;
    label: string;
    sourceStart: string;
    sourceEnd: string;
  }[];
  rows: ({ hour: number; times: Record<WeatherKey, string | null> } & Record<
    WeatherKey,
    number | null
  >)[];
};
export type RegionalEvidence = {
  title: string;
  dateRange: string;
  credit: string;
  source: string;
  registration: string;
  patch: number[][];
  traverse: { sol: number; points: number[][] }[];
  threeForks: { title: string; date: string; url: string };
};
export type ExpeditionEvidence = {
  weather: WeatherArchive | null;
  regional: RegionalEvidence | null;
};
export function validateEvidence(value: unknown): ExpeditionEvidence {
  const data = value as ExpeditionEvidence;
  const weather = data?.weather;
  const regional = data?.regional;
  const keys: WeatherKey[] = ["temperatureC", "pressurePa", "windMps"];
  const validWeather =
    weather &&
    Number.isInteger(weather.sol) &&
    [
      weather.location,
      weather.sourceTime,
      weather.timeBasis,
      weather.method,
      weather.quality,
    ].every((v) => typeof v === "string") &&
    keys.every((k) => typeof weather.units?.[k] === "string") &&
    Array.isArray(weather.products) &&
    weather.products.length >= 3 &&
    weather.products.every(
      (p) =>
        [p.channel, p.productId, p.file, p.sourceStart, p.sourceEnd].every(
          (v) => typeof v === "string",
        ) &&
        p.url?.startsWith("https://") &&
        p.label?.startsWith("https://"),
    ) &&
    Array.isArray(weather.rows) &&
    weather.rows.length > 0 &&
    weather.rows.length <= 8 &&
    new Set(weather.rows.map((row) => row?.hour)).size ===
      weather.rows.length &&
    weather.rows.every(
      (r) =>
        !!r &&
        Number.isInteger(r.hour) &&
        r.hour >= 0 &&
        r.hour < 24 &&
        keys.every(
          (k) =>
            (r[k] === null || Number.isFinite(r[k])) &&
            (r.times?.[k] === null || typeof r.times?.[k] === "string"),
        ),
    );
  const point = (p: number[]) =>
    Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
  const validRegional =
    regional &&
    [
      regional.title,
      regional.dateRange,
      regional.credit,
      regional.registration,
    ].every((v) => typeof v === "string") &&
    regional.source?.startsWith("https://") &&
    regional.threeForks?.url?.startsWith("https://") &&
    Array.isArray(regional.patch) &&
    regional.patch.length === 4 &&
    regional.patch.every(point) &&
    Array.isArray(regional.traverse) &&
    regional.traverse.length > 0 &&
    regional.traverse.every(
      (t) =>
        Number.isInteger(t.sol) &&
        Array.isArray(t.points) &&
        t.points.length > 0 &&
        t.points.every(point),
    );
  return {
    weather: validWeather ? weather : null,
    regional: validRegional ? regional : null,
  };
}
