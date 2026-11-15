import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageFile = path.join(projectRoot, "node_modules", "@lucasmarkes", "hairline", "dist", "index.js");
let source = await readFile(packageFile, "utf8");

const start = source.indexOf("var mount26 =");
const end = source.indexOf("// src/figures/sieve.ts", start);
if (start < 0 || end < 0) throw new Error("Could not locate the Settle source section in @lucasmarkes/hairline.");
let settle = source.slice(start, end);

const originalWrapper = 'el: solid(mk("g", {}, g)),';
const fixedWrapper = "el: solid(g),";
const originalInset = "put(tl.el, slab3(P, front2, r, inset(C, r, 1), p.z, p.z + TH5));";
const fixedInset = [
  "const inner = turned(p.x, p.y, HALF2 - 1, 2.6, p.a);",
  "    put(tl.el, slab3(P, front2, r, inner, p.z, p.z + TH5));",
].join("\n");

function replaceOnce(before, after, label) {
  const count = settle.split(before).length - 1;
  if (count === 0 && settle.includes(after)) return;
  if (count !== 1) throw new Error(`Expected one ${label} source anchor, found ${count}.`);
  settle = settle.replace(before, after);
}

replaceOnce(originalWrapper, fixedWrapper, "Settle tile group");
replaceOnce(originalInset, fixedInset, "Settle inner tile face");
source = source.slice(0, start) + settle + source.slice(end);
await writeFile(packageFile, source);
