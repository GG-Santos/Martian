import type { LocationId } from "./catalog";

/** Deterministic illustrative cartography for places without a packaged local raster. */
export function paintTerrain(canvas: HTMLCanvasElement, id: LocationId, topography = false) {
  const width = canvas.width;
  const height = canvas.height;
  const context = canvas.getContext("2d");
  if (!context) return;
  const image = context.createImageData(width, height);
  const seed = id === "gale" ? 5.4 : id === "valles" ? 13.7 : 1.8;
  const craters = id === "gale"
    ? [[.26, .4, .18], [.75, .75, .09], [.65, .2, .06]]
    : id === "valles"
      ? [[.1, .75, .06], [.78, .22, .06]]
      : [[.25, .26, .09], [.77, .56, .07], [.53, .79, .05]];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = x / width;
      const v = y / height;
      const n = .48 * wave(u * 4.7, v * 5.3, seed) + .26 * wave(u * 15, v * 17, seed + 9) + .12 * wave(u * 59, v * 63, seed + 21);
      let relief = n;
      if (id === "valles") relief -= .5 * Math.exp(-Math.pow((v - .47 - .085 * Math.sin(u * 12)) / .072, 2));
      if (id === "gale") relief += .16 * Math.exp(-Math.pow((u - .52) / .15, 2) - Math.pow((v - .45) / .12, 2));
      for (const [cx, cy, radius] of craters) {
        const r = Math.hypot((u - cx) * 1.1, v - cy) / radius;
        relief += .22 * Math.exp(-Math.pow((r - 1) / .11, 2)) - .16 * Math.exp(-r * r * 2);
      }
      const shade = Math.max(0, Math.min(1, .53 + relief));
      const index = (y * width + x) * 4;
      if (topography) {
        const value = Math.round(61 + shade * 147);
        image.data[index] = value;
        image.data[index + 1] = value - 3;
        image.data[index + 2] = value - 7;
      } else {
        image.data[index] = Math.round(91 + shade * 116);
        image.data[index + 1] = Math.round(51 + shade * 77);
        image.data[index + 2] = Math.round(44 + shade * 63);
      }
      image.data[index + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
}

function wave(x: number, y: number, seed: number) {
  const coarse = Math.sin(x * 1.8 + seed) * Math.cos(y * 2.1 - seed * .7);
  const diagonal = Math.sin((x + y) * 2.8 + seed * 3.2);
  return .5 * coarse + .5 * diagonal;
}
