import usgsFeatures from "./mars-pois.json";
import { locations } from "./catalog";

export type MarsPoi = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  region: string;
  fact: string;
  factSource: string;
  sourceLabel: string;
  classification: string;
  featured: boolean;
};

const featured: MarsPoi[] = locations.map((location) => ({
  id: location.id,
  name: location.name,
  latitude: location.latitude,
  longitude: location.longitude,
  region: location.region,
  fact: location.fact,
  factSource: location.factSource,
  sourceLabel: "NASA Science",
  classification: location.kind === "observed" ? "NASA LOCAL SECTOR" : "SIMULATED FIELD SECTOR",
  featured: true,
}));

const usgs: MarsPoi[] = usgsFeatures
  .filter((feature) => !featured.some((location) => location.name === feature.name))
  .map((feature) => ({
    id: `usgs-${feature.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    name: feature.name,
    latitude: feature.latitude,
    longitude: feature.longitude,
    region: feature.region,
    fact: feature.fact,
    factSource: feature.source,
    sourceLabel: "USGS Gazetteer",
    classification: "NAMED MARTIAN FEATURE",
    featured: false,
  }));

export const marsPois: readonly MarsPoi[] = [...featured, ...usgs];

export function getMarsPoi(id: string): MarsPoi {
  return marsPois.find((poi) => poi.id === id) ?? marsPois[0];
}
