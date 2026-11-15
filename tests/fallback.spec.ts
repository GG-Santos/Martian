import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { scannerCrew } from "./helpers/scanner-crew";
import type { HeightGrid, LocalPoint } from "../src/features/mission/types";
import { sampleHeight } from "../src/features/terrain/spatial";

test.beforeEach(async ({ page }) => { await scannerCrew(page); });
test("the launched scanner has no external science dependency", async ({ page }) => {
  const external: string[] = [];
  await page.route("**/*", async (route) => {
    const u = new URL(route.request().url());
    if (u.hostname !== "127.0.0.1") {
      if (!u.hostname.endsWith(".kaspersky-labs.com")) external.push(u.href);
      await route.abort();
    } else await route.continue();
  });
  await page.goto("/scanner");
  await expect(page.getByTestId("crew-route-status")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: /Efficient.*m round trip/ }),
  ).toBeVisible();
  expect(external).toEqual([]);
});
for (const kind of ["missing", "corrupt"])
  test(`${kind} heights show local overview and recovery`, async ({ page }) => {
    await page.route("**/heights.f32", (r) =>
      kind === "missing"
        ? r.fulfill({ status: 404, body: "missing" })
        : r.fulfill({ body: Buffer.from("bad") }),
    );
    await page.goto("/scanner");
    await expect(
      page.getByRole("heading", { name: "Terrain overview" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Retry dataset" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Read dataset sources" }),
    ).toBeVisible();
  });
test("missing regional record preserves measured weather and its sources", async ({ page }) => {
  const evidence = JSON.parse(await readFile("public/data/jezero/expedition-evidence.json", "utf8"));
  evidence.regional = null;
  const body = JSON.stringify(evidence);
  const manifest = JSON.parse(await readFile("public/data/jezero/manifest.json", "utf8"));
  manifest.assets["expedition-evidence.json"] = createHash("sha256").update(body).digest("hex");
  await page.route("**/manifest.json", (r) => r.fulfill({ json: manifest }));
  await page.route("**/expedition-evidence.json", (r) => r.fulfill({ body }));
  await page.goto("/scanner");
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  await expect(page.getByText("Regional archive unavailable.")).toBeVisible();
  await expect(page.getByRole("table")).toContainText("-71.53");
  await page.getByRole("button", { name: "Sample times & source products" }).click();
  await expect(page.getByRole("link", { name: "PDS label" }).first()).toBeVisible();
});
test("WebGL failure yields the north-up overview", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      kind: string,
      ...args: unknown[]
    ) {
      if (kind.startsWith("webgl")) return null;
      return Reflect.apply(original, this, [kind, ...args]);
    } as typeof original;
  });
  await page.goto("/scanner");
  await expect(
    page.getByRole("heading", { name: "Terrain overview" }),
  ).toBeVisible();
  await expect(page.getByTestId("crew-route-status")).toBeVisible();
});
test("a no-data cell preserves a valid shared route through mapped terrain", async ({ page }) => {
  await page.goto("/scanner");
  const route = page.getByTestId("crew-route-status");
  await expect(route).toContainText("round trip");
  const original = JSON.parse((await route.getAttribute("data-route-nodes"))!) as { point: LocalPoint }[];
  const raw = await readFile("public/data/jezero/heights.f32");
  const manifest = JSON.parse(await readFile("public/data/jezero/manifest.json", "utf8"));
  // Put the gap on a known traversed segment, away from its endpoints, so the
  // fixture requires a detour even when route preferences or terrain change.
  const legs = original.slice(1).map(({ point }, index) => ({ start: original[index].point, end: point }));
  const length = ({ start, end }: typeof legs[number]) => Math.hypot(end.x - start.x, end.y - start.y);
  const longest = legs.reduce((best, leg) => length(leg) > length(best) ? leg : best);
  expect(length(longest)).toBeGreaterThan(manifest.grid.cellSizeM * 4);
  const blocked = { x: (longest.start.x + longest.end.x) / 2, y: (longest.start.y + longest.end.y) / 2 };
  const col = Math.floor((blocked.x - manifest.grid.westM) / manifest.grid.cellSizeM);
  const row = Math.floor((manifest.grid.northM - blocked.y) / manifest.grid.cellSizeM);
  raw.writeFloatLE(NaN, (row * manifest.grid.width + col) * 4);
  const grid: HeightGrid = {
    ...manifest.grid,
    values: Float32Array.from({ length: raw.length / 4 }, (_, index) => raw.readFloatLE(index * 4)),
  };
  expect(sampleHeight(grid, blocked)).toBeNull();
  manifest.assets["heights.f32"] = createHash("sha256").update(raw).digest("hex");
  await page.route("**/manifest.json", (r) => r.fulfill({ json: manifest }));
  await page.route("**/heights.f32", (r) => r.fulfill({ body: raw }));
  await page.reload();
  await expect(route).toContainText("round trip");
  const nodes = JSON.parse((await route.getAttribute("data-route-nodes"))!) as { point: LocalPoint }[];
  expect(nodes.length).toBeGreaterThan(2);
  expect(nodes.every(({ point }) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true);
  for (let index = 1; index < nodes.length; index++) {
    const start = nodes[index - 1].point, end = nodes[index].point;
    const dx = end.x - start.x, dy = end.y - start.y;
    const crossings = [0, 1];
    for (let col = 0; dx !== 0 && col < grid.width; col++) {
      const t = (grid.westM + col * grid.cellSizeM - start.x) / dx;
      if (t > 0 && t < 1) crossings.push(t);
    }
    for (let row = 0; dy !== 0 && row < grid.height; row++) {
      const t = (grid.northM - row * grid.cellSizeM - start.y) / dy;
      if (t > 0 && t < 1) crossings.push(t);
    }
    crossings.sort((a, b) => a - b);
    // Check every boundary and the interior of every crossed interpolation cell;
    // fixed-distance sampling can miss a brief crossing near a cell corner.
    const samples = crossings.flatMap((t, i) => i === 0 ? [t] : [(crossings[i - 1] + t) / 2, t]);
    for (const t of samples) {
      const point = { x: start.x + dx * t, y: start.y + dy * t };
      expect(sampleHeight(grid, point), `segment ${index} at ${JSON.stringify(point)}`).not.toBeNull();
    }
  }
});
test("keyboard controls and reduced motion preserve shared planning and sources", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/scanner");
  await expect(page.getByTestId("crew-route-status")).toContainText("round trip");
  const activate = async (name: string) => {
    const b = page.getByRole("button", { name, exact: true }); await b.focus(); await b.press("Enter");
  };
  await activate("Terrain slope"); await activate("Top down"); await activate("Reset camera");
  await page.getByText("Optional map objectives", { exact: true }).focus(); await page.keyboard.press("Enter");
  await activate("Add Profile the ridge");
  await expect(page.getByRole("list", { name: "Visit order" })).toContainText("Profile the ridge");
  await activate("Remove Profile the ridge");
  await expect(page.getByRole("list", { name: "Visit order" })).not.toContainText("Profile the ridge");
  await activate("Sources & assumptions");
  await expect(page.getByRole("complementary", { name: "Sources and assumptions" })).toBeVisible();
  await activate("Close sources");
  await expect(page.getByRole("button", { name: "Sources & assumptions" })).toBeFocused();
  await page.locator(".map-detail-tray > summary").click();
  await page.getByLabel("Inspect route elevation").focus(); await page.keyboard.press("ArrowRight");
  await expect(page.getByText(/m along route/)).toBeVisible();
});
test("desktop and mobile render without overflow or blank terrain", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/scanner");
  await expect(
    page.getByRole("button", { name: "Locate base CREW BASE" }),
  ).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("desktop.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Locate base CREW BASE" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("mobile.png"),
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test("damaged mission JSON uses overview instead of crashing", async ({
  page,
}) => {
  const meta = JSON.parse(
    await readFile("public/data/jezero/mission.json", "utf8"),
  );
  meta.presetNodes = [];
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.route("**/mission.json", (r) => r.fulfill({ json: meta }));
  await page.goto("/scanner");
  await expect(
    page.getByRole("heading", { name: "Terrain overview" }),
  ).toBeVisible();
  await expect(
    page.getByText("Mission metadata checksum failed.", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Retry dataset" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
