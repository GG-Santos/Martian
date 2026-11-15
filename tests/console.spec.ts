import { test, expect } from "@playwright/test";
import { scannerCrew } from "./helpers/scanner-crew";

test.beforeEach(async ({ page }) => { await scannerCrew(page); });

test("the shared round trip remains visible above transparent science layers", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/scanner");
  await expect(page.getByTestId("crew-route-status")).toContainText("round trip");
  await expect(page.getByRole("button", { name: "Locate base CREW BASE" })).toBeVisible();
  // Inspect composited pixels, masking labels so they cannot pass for a route.
  const image = await page.locator("canvas").screenshot({ mask: [page.locator(".map-marker"), page.locator(".live-map-marker")], maskColor: "#13191a" });
  const count = await page.evaluate(async (base64) => {
    const i = new Image(); i.src = "data:image/png;base64," + base64; await i.decode();
    const c = document.createElement("canvas"); c.width = i.width; c.height = i.height;
    const ctx = c.getContext("2d")!; ctx.drawImage(i, 0, 0);
    const a = ctx.getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let p = 0; p < a.length; p += 4) if (a[p] > 90 && a[p + 1] > 175 && a[p + 2] > 140 && a[p + 1] > a[p] + 20) n++;
    return n;
  }, image.toString("base64"));
  expect(count).toBeGreaterThan(100);
});

test("science layers preserve shared objective edits and route preference across reload", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/scanner");
  const planner = page.getByRole("region", { name: "Mission planner" });
  await expect(page.getByTestId("crew-route-status")).toContainText("round trip");
  const before = await page.getByTestId("crew-route-status").innerText();
  await page.getByRole("button", { name: "Thermal context", exact: true }).click();
  await expect(page.getByTestId("crew-route-status")).toHaveText(before);
  await planner.getByText("Optional map objectives", { exact: true }).click();
  await planner.getByRole("button", { name: "Add Profile the ridge" }).click();
  await expect(planner.getByRole("list", { name: "Visit order" })).toContainText("Profile the ridge");
  await planner.getByRole("button", { name: /Lower exposure.*m round trip/ }).click();
  await expect(page.getByTestId("crew-route-status")).toHaveAttribute("data-route-preference", "lower-exposure");
  await page.reload();
  await expect(planner.getByRole("list", { name: "Visit order" })).toContainText("Profile the ridge");
  await expect(page.getByTestId("crew-route-status")).toHaveAttribute("data-route-preference", "lower-exposure");
  await planner.getByRole("button", { name: "Remove Profile the ridge" }).click();
  await expect(planner.getByRole("list", { name: "Visit order" })).not.toContainText("Profile the ridge");
  expect(errors).toEqual([]);
});
