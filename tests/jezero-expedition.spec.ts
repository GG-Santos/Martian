import { expect, test } from "@playwright/test";
import { scannerCrew } from "./helpers/scanner-crew";

test.beforeEach(async ({ page }) => { await scannerCrew(page); });

test("inspection samples terrain without changing the shared round trip", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/scanner");
  await expect(page.getByTestId("crew-route-status")).toContainText("round trip");
  const before = await page.getByTestId("crew-route-status").getAttribute("data-route-nodes");
  await page.getByRole("button", { name: "Inspect", exact: true }).click();
  const canvas = page.locator("canvas");
  const box = (await canvas.boundingBox())!;
  await canvas.click({ position: { x: box.width * 0.53, y: box.height * 0.32 } });
  await expect(page.locator(".probe-card")).toContainText("Mars 2000");
  await expect(page.getByTestId("crew-route-status")).toHaveAttribute("data-route-nodes", before!);
});

test("map objectives retain crew context and the shared plan survives reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/scanner");
  await page.getByRole("button", { name: /Inspect quest Survey the surface contact/ }).first().click();
  await page.locator("canvas").hover({ position: { x: 5, y: 5 } });
  await page.mouse.wheel(0, -40);
  await expect(page.locator(".map-caption")).toContainText(/Site A.*1 m detail/);
  await page.getByRole("button", { name: /Inspect quest Profile the ridge/ }).first().click();
  await page.locator("canvas").hover({ position: { x: 5, y: 5 } });
  await page.mouse.wheel(0, -40);
  await expect(page.locator(".map-caption")).toContainText(/Site B.*1 m detail/);
  await expect(page.getByRole("region", { name: "Live expedition" })).toContainText("Profile the ridge");
  await page.getByRole("button", { name: "Add to shared plan" }).click();
  await expect(page.getByRole("list", { name: "Visit order" })).toContainText("Profile the ridge");
  await page.reload();
  await expect(page.getByRole("list", { name: "Visit order" })).toContainText("Profile the ridge");
  await expect(page.getByRole("button", { name: "Locate base CREW BASE" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Locate astronaut Scout" })).toBeVisible();
  expect(errors).toEqual([]);
});

test("optional detail and archive failure preserve shared planning and embedded fullscreen", async ({ page }) => {
  await page.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new DOMException("Embed")); });
  await page.route("**/detail-a.f32", (route) => route.fulfill({ body: Buffer.alloc(513 ** 2 * 4) }));
  await page.route("**/expedition-evidence.json", (route) => route.abort());
  await page.goto("/scanner");
  await expect(page.getByTestId("crew-route-status")).toContainText("round trip");
  await page.getByRole("button", { name: /Inspect quest Survey the surface contact/ }).first().click();
  await page.locator("canvas").hover({ position: { x: 5, y: 5 } });
  await page.mouse.wheel(0, -40);
  await expect(page.locator(".map-caption")).toContainText("detail unavailable");
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  await expect(page.getByText("Weather archive unavailable. Route planning remains available.")).toBeVisible();
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await expect(page.locator(".workspace")).toHaveClass(/workspace-expanded/);
  await page.keyboard.press("Escape");
  await expect(page.locator(".workspace")).not.toHaveClass(/workspace-expanded/);
  await expect(page.getByRole("button", { name: /Efficient.*m round trip/ })).toBeEnabled();
});

test("mobile expedition exposes terrain readings and sourced weather archive", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  await scannerCrew(page);
  await page.goto("/scanner");
  await expect(page.getByRole("button", { name: "Locate base CREW BASE" })).toBeVisible();
  await page.getByRole("button", { name: "Inspect", exact: true }).click();
  const canvas = page.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width * 0.7, box.y + box.height * 0.65);
  await expect(page.locator(".probe-card")).toContainText("8 m analysis");
  await page.getByRole("tab", { name: "Evidence", exact: true }).click();
  await page.getByRole("table").scrollIntoViewIfNeeded();
  await expect(page.getByRole("table")).toContainText("-71.53");
  await expect(page.getByRole("img", { name: /Archived Perseverance traverse/ })).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(392);
  await context.close();
});
