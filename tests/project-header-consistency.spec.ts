import { scannerCrew } from "./helpers/scanner-crew";
import { expect, test } from "@playwright/test";

for (const route of ["/", "/board", "/crew", "/scanner"]) {
  test(`shared header stays above the content on ${route}`, async ({ page }) => {
    await page.setViewportSize({ width: 1054, height: 649 });
    if (route === "/scanner") await scannerCrew(page);
    await page.goto(route);
    if (route === "/scanner") await expect(page.getByRole("heading", { name: "Jezero terrain scanner" })).toBeVisible();

    const header = page.locator(".project-header");
    const main = page.locator(".project-shell > .project-content > main");
    const headerBox = await header.boundingBox();
    const mainBox = await main.boundingBox();
    expect(headerBox).not.toBeNull();
    expect(mainBox).not.toBeNull();
    expect(headerBox!.y).toBe(0);
    if (route === "/") {
      expect(mainBox!.y).toBe(0);
      expect(await header.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgba(0, 0, 0, 0)");
      expect(await header.evaluate((element) => getComputedStyle(element).borderBottomColor)).toBe("rgba(0, 0, 0, 0)");
    } else {
      expect(mainBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
      expect(await header.evaluate((element) => getComputedStyle(element).backgroundColor)).toBe("rgb(14, 15, 18)");
    }
  });
}

test("home, board, crew, and scanner keep the shared header on narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  for (const route of ["/", "/board", "/crew", "/scanner"]) {
    if (route === "/scanner") await scannerCrew(page);
    await page.goto(route);
    if (route === "/scanner") await expect(page.getByRole("heading", { name: "Jezero terrain scanner" })).toBeVisible();
    const headerBox = await page.locator(".project-header").boundingBox();
    const mainBox = await page.locator(".project-content > main").boundingBox();
    expect(headerBox).not.toBeNull();
    expect(mainBox).not.toBeNull();
    expect(headerBox!.y).toBe(0);
    if (route === "/") expect(mainBox!.y).toBe(0);
    else expect(mainBox!.y).toBeGreaterThanOrEqual(headerBox!.y + headerBox!.height);
  }
});

test("home globe labels do not select text", async ({ page }) => {
  await page.goto("/");
  const label = page.locator(".globe-location").first();
  await expect(label).toBeVisible();
  expect(await label.evaluate((element) => getComputedStyle(element).userSelect)).toBe("none");
});

test("crew mission setup keeps the shared header visible", async ({ page }) => {
  await page.setViewportSize({ width: 1054, height: 649 });
  await page.goto("/crew");
  await expect(page.getByRole("region", { name: "Choose how to enter a crew" })).toBeVisible();
  await page.getByRole("button", { name: "Create a crew" }).click();
  await page.getByLabel("Crew name").fill("Survey Crew");
  await page.getByLabel("Your name").fill("Alex");
  await page.getByRole("button", { name: "Continue to mission" }).click();
  await expect(page.getByRole("region", { name: "Mission selection" })).toBeVisible();

  await expect(page.getByRole("region", { name: "Mission selection" })).toBeVisible();
  await expect(page.locator(".project-header")).toBeVisible();
  expect((await page.locator(".project-header").boundingBox())?.y).toBe(0);
});

test("scanner uses the shared site brand and navigation", async ({ page }) => {
  await scannerCrew(page);
  await page.goto("/scanner");
  await expect(page.locator(".project-header .project-brand")).toContainText("EARTH APPS");
  await expect(page.getByRole("navigation", { name: "Project navigation" }).getByRole("link", { name: "Mission Command" })).toHaveAttribute("href", "/");
  await expect(page.getByRole("heading", { name: "Jezero terrain scanner" })).toBeVisible();
});
