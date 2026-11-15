import catalog from "./sky-catalog.json";

export type Star = [hip: number, raHours: number, decDegrees: number, magnitude: number, name: string];
export const skyStars = catalog as Star[];

// Conventional figures connect catalog stars; IAU constellation boundaries are separate.
const figures: Record<string, string[][]> = {
  Orion: [["Betelgeuse", "Bellatrix", "Mintaka", "Alnilam", "Alnitak", "Saiph", "Rigel", "Mintaka"], ["Betelgeuse", "Alnitak"], ["Bellatrix", "Rigel"]],
  "Ursa Major": [["Dubhe", "Merak", "Phecda", "Megrez", "Dubhe"], ["Megrez", "Alioth", "Mizar", "Alkaid"]],
  Cassiopeia: [["Caph", "Schedar", "Cih", "Ruchbah", "Segin"]],
  Crux: [["Gacrux", "Acrux"], ["Mimosa", "Imai"]],
  Scorpius: [["Acrab", "Dschubba", "Antares", "Sargas", "Shaula"]],
};

const byName = new Map(skyStars.filter((star) => star[4]).map((star) => [star[4], star]));
export const constellationSegments = Object.entries(figures).flatMap(([name, paths]) => paths.flatMap((path) => path.slice(1).flatMap((target, index) => {
  const from = byName.get(path[index]);
  const to = byName.get(target);
  return from && to ? [{ name, from, to }] : [];
})));

export function starPosition(star: Star, radius = 80): [number, number, number] {
  const ra = star[1] * Math.PI / 12;
  const dec = star[2] * Math.PI / 180;
  return [Math.cos(dec) * Math.sin(ra) * radius, Math.sin(dec) * radius, Math.cos(dec) * Math.cos(ra) * radius];
}
