import { readFileSync, writeFileSync } from "node:fs";

function csv(line) {
  const values = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') { value += '"'; i++; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { values.push(value); value = ""; }
    else value += char;
  }
  values.push(value);
  return values;
}

const input = process.argv[2];
if (!input) throw new Error("Pass the HYG v4.1 CSV path");
const rows = readFileSync(input, "utf8").split(/\r?\n/);
const header = csv(rows.shift());
const index = (name) => header.indexOf(name);
const stars = rows.filter(Boolean).map((row) => {
  const fields = csv(row);
  return { hip: Number(fields[index("hip")]), ra: Number(fields[index("ra")]), dec: Number(fields[index("dec")]), mag: Number(fields[index("mag")]), name: fields[index("proper")] };
}).filter((star) => star.hip && Number.isFinite(star.ra) && Number.isFinite(star.dec) && star.mag <= 6);
const output = stars.map(({ hip, ra, dec, mag, name }) => [hip, +ra.toFixed(5), +dec.toFixed(5), +mag.toFixed(2), name || ""]);
writeFileSync("src/features/locations/sky-catalog.json", JSON.stringify(output));
console.log(`${output.length} J2000 stars written`);
