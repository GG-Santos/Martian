/** Location identity is shared by the public atlas and multiplayer mission setup. */
export type LocationId = "jezero" | "gale" | "valles";

export type Location = {
  id: LocationId;
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  kind: "observed" | "simulated";
  summary: string;
  fact: string;
  factSource: string;
  objective: string;
  dataLabel: string;
  accent: string;
};

export const locations: readonly Location[] = [
  {
    id: "jezero", name: "Jezero Crater", region: "Nili Fossae margin",
    latitude: 18.4672, longitude: 77.52, kind: "observed",
    summary: "A 2.048 km mapped sector with bundled HiRISE optical and elevation observations and THEMIS thermal context.",
    fact: "Jezero is a 45 km impact crater that once held a lake and an ancient river delta. NASA selected its clays and carbonates as promising places to look for preserved signs of past microbial life.",
    factSource: "https://science.nasa.gov/resource/jezero-crater-mars-2020-rover-landing-site/",
    objective: "Compare surface contacts, ridge relief, and thermal patterns.",
    dataLabel: "NASA orbital observations · local sector", accent: "#d8cbb7",
  },
  {
    id: "gale", name: "Gale Crater", region: "Aeolis quadrangle",
    latitude: -5.4, longitude: 137.8, kind: "simulated",
    summary: "An illustrative field sector inspired by the crater's layered landscapes. Terrain, weather, and routes here are procedurally simulated.",
    fact: "Gale Crater is about 154 km across. Its central Mount Sharp exposes layered rocks that record a long history of changing Martian environments; NASA's Curiosity rover explores its lower slopes.",
    factSource: "https://science.nasa.gov/resource/gale-craters-history-book/",
    objective: "Plan a stratigraphic transect across a simulated outcrop field.",
    dataLabel: "Simulated preview · no local NASA terrain package", accent: "#c49e83",
  },
  {
    id: "valles", name: "Melas Chasma", region: "Valles Marineris",
    latitude: -9.4, longitude: 289.6, kind: "simulated",
    summary: "An illustrative canyon sector. Relief, risk classifications, and routes are simulated and need source data before field use.",
    fact: "Melas Chasma lies near the center of Valles Marineris. NASA reports canyon depths reaching about 9 km below the surrounding plains.",
    factSource: "https://science.nasa.gov/photojournal/pj-melas-chasma-15/",
    objective: "Scout a simulated canyon-rim traverse and return corridor.",
    dataLabel: "Simulated preview · no local NASA terrain package", accent: "#b38575",
  },
] as const;

export function getLocation(id: string | null | undefined): Location {
  return locations.find((location) => location.id === id) ?? locations[0];
}
