import { readFileSync } from "node:fs";
import sharp from "sharp";

// PDS MEG004: 1440 × 720 SignedMSB2 meters, 90° N to 90° S, 0° E to 360° E.
const input = process.argv[2];
if (!input) throw new Error("Pass the PDS MOLA MEG004 topography IMG path");
const raw = readFileSync(input);
const width = 1440;
const height = 720;
if (raw.length !== width * height * 2) throw new Error("Unexpected MOLA grid dimensions");
const pixels = Buffer.alloc(width * height);
for (let i = 0; i < pixels.length; i++) {
  const meters = raw.readInt16BE(i * 2);
  pixels[i] = Math.max(0, Math.min(255, Math.round((meters + 8068) * 255 / (21134 + 8068))));
}
await sharp(pixels, { raw: { width, height, channels: 1 } }).png().toFile("public/images/locations/mars-mola-height.png");
console.log("MOLA global height texture written");
