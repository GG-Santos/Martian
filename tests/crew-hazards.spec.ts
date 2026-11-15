import { expect, test } from "@playwright/test";
import { scannerCrew } from "./helpers/scanner-crew";

test.beforeEach(async ({ page }) => { await scannerCrew(page); });

test("live crew selection, movement and shared simulation retain a usable map", async ({ page }) => {
  await page.goto("/scanner");
  const live = page.getByRole("region", { name: "Live expedition" });
  await live.getByRole("button", { name: /Scout.*you/ }).click();
  await expect(page.getByRole("button", { name: "Locate astronaut Scout" })).toBeInViewport();
  await page.getByLabel("Relief scale").selectOption("5");
  await expect(page.getByRole("button", { name: "Locate astronaut Scout" })).toBeInViewport();
  const scenario = page.getByRole("region", { name: "Dust scenario" });
  await scenario.getByRole("combobox", { name: "Dust scenario" }).selectOption("modeled-central-v1");
  await scenario.getByRole("button", { name: "Step 0.5 sol" }).click();
  await expect(scenario.getByTestId("simulation-time")).toContainText("0.50");
  await scenario.getByRole("button", { name: "Reset simulation" }).click();
  await expect(scenario.getByTestId("simulation-time")).toContainText("0.00");
  await expect(live.getByRole("button", { name: "East", exact: true })).toBeEnabled();
});

test("hazards and eight science categories keep inspection modes exclusive", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/scanner");
  await page.getByRole("button", { name: "Inspect", exact: true }).click();
  await page.getByRole("button", { name: "Inspect hazard H-02 Loose-sand scenario", exact: true }).click();
  await expect(page.getByRole("button", { name: "Inspect", exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByRole("heading", { name: "Potential risks", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Legend", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Map symbols", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Close map legend", exact: true }).click();
  const atlas = page.getByRole("navigation", { name: "Science atlas" });
  for (const name of ["Optical", "Thermal", "Topographic", "Atmospheric", "Spectral", "Geophysical", "Radiation", "Chemical"]) {
    await atlas.getByRole("button", { name: new RegExp(`^${name} `) }).click();
    if (["Spectral", "Geophysical", "Radiation", "Chemical"].includes(name)) {
      const card = page.getByRole("region", { name: `${name.toLowerCase()} evidence` });
      await expect(card.getByRole("img")).toBeVisible();
      await expect(card.getByRole("link", { name: /Original science source/ })).toBeVisible();
    }
  }
  await atlas.getByRole("button", { name: /^Topographic / }).click();
  await page.getByRole("tab", { name: "Crew", exact: true }).click();
  await page.getByRole("region", { name: "Live expedition" }).getByRole("button", { name: /Scout.*you/ }).click();
  await expect(page.getByRole("button", { name: "Locate astronaut Scout" })).toBeInViewport();
});

test("optional archive failures preserve live crew, hazard safety and fullscreen", async ({ page }) => {
  await page.addInitScript(() => { Element.prototype.requestFullscreen = () => Promise.reject(new DOMException("Embed")); });
  await page.route("**/scenario.json", (r) => r.fulfill({ body: "corrupt" }));
  await page.route("**/science-atlas.json", (r) => r.abort());
  await page.goto("/scanner");
  await page.getByRole("tab", { name: "Map hazards", exact: true }).click();
  await expect(page.getByText(/Scenario annotations unavailable/)).toBeVisible();
  await expect(page.getByTestId("crew-route-status")).toContainText("Fixed hazard data unavailable");
  await expect(page.getByTestId("crew-route-status")).not.toHaveAttribute("data-route-nodes", /.+/);
  await page.getByRole("tab", { name: "Crew", exact: true }).click();
  await expect(page.getByRole("region", { name: "Live expedition" }).getByRole("button", { name: "East", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await expect(page.locator(".workspace")).toHaveClass(/workspace-expanded/);
  await page.keyboard.press("Escape");
  await page.getByRole("navigation", { name: "Science atlas" }).getByRole("button", { name: /^Spectral / }).click();
  await expect(page.getByText(/Evidence archive unavailable/)).toBeVisible();
});

test("touch crew selection and a missing evidence image retain usable views", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
  const page = await context.newPage();
  await scannerCrew(page);
  await page.route("**/atlas/chemical.webp", (r) => r.fulfill({ status: 404, body: "missing" }));
  await page.goto("/scanner");
  await page.getByRole("region", { name: "Live expedition" }).getByRole("button", { name: /Scout.*you/ }).click();
  const marker = page.getByRole("button", { name: "Locate astronaut Scout" });
  await expect(marker).toBeVisible();
  const canvas = page.locator("canvas"); await canvas.scrollIntoViewIfNeeded();
  const box = (await canvas.boundingBox())!;
  const before = (await marker.boundingBox())!;
  const touch = await context.newCDPSession(page), x = Math.round(box.x + box.width * 0.65), y = Math.round(box.y + box.height * 0.6);
  await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + 25, y }] });
  await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect.poll(async () => Math.abs((await marker.boundingBox())!.x - before.x)).toBeGreaterThan(10);
  await page.getByRole("navigation", { name: "Science atlas" }).getByRole("button", { name: /^Chemical\b/ }).click();
  await expect(page.getByText(/Evidence image unavailable/)).toBeVisible();
  await expect(page.getByRole("link", { name: /Original science source/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(392);
  await context.close();
});
