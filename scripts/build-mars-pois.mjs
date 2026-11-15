import { readFileSync, writeFileSync } from "node:fs";

const names = [
  "Olympus Mons", "Arsia Mons", "Ascraeus Mons", "Pavonis Mons", "Elysium Mons", "Alba Mons",
  "Melas Chasma", "Candor Chasma", "Ophir Chasma", "Ius Chasma", "Hebes Chasma", "Tithonium Chasma", "Noctis Labyrinthus",
  "Gusev", "Hellas Planitia", "Argyre Planitia", "Isidis Planitia", "Utopia Planitia", "Schiaparelli", "Holden", "Endeavour", "Victoria", "Eberswalde", "Lyot", "Korolev", "Huygens",
  "Kasei Valles", "Ares Vallis", "Mawrth Vallis", "Nili Fossae", "Athabasca Valles",
  "Planum Boreum", "Planum Australe", "Syrtis Major Planum", "Arabia Terra", "Meridiani Planum", "Elysium Planitia", "Chryse Planitia", "Terra Cimmeria",
  "Apollinaris Mons", "Hecates Tholus", "Hadriacus Mons", "Ma'adim Vallis", "Dao Vallis", "Mangala Valles",
];
const input = process.argv[2];
if (!input) throw new Error("Pass the USGS Mars nomenclature KML path");
const source = readFileSync(input, "utf8");
const records = [...source.matchAll(/<Placemark\b[\s\S]*?<\/Placemark>/g)].map(([block]) => {
  const value = (field) => block.match(new RegExp(`<SimpleData name="${field}">([\\s\\S]*?)<\\/SimpleData>`))?.[1] ?? "";
  return { name: block.match(/<name>([^<]+)<\/name>/)?.[1] ?? "", latitude: Number(value("center_lat")), longitude: Number(value("center_lon")), kind: value("type"), diameterKm: Number(value("diameter")), region: value("quad_name"), source: value("link").replace("http:", "https:") };
});
const selected = names.map((name) => records.find((record) => record.name === name)).filter(Boolean);
const missing = names.filter((name) => !selected.some((record) => record.name === name));
writeFileSync("src/features/locations/mars-pois.json", JSON.stringify(selected));
console.log(`${selected.length} named Mars features written; missing: ${missing.join(", ") || "none"}`);
