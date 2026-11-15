import { expect, test } from "@playwright/test";

test("mission command cycles three destinations and opens the atlas", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Mission Command" })).toBeVisible();
  const carousel = page.getByRole("region", { name: "Mars location choices" });
  await expect(carousel.getByRole("heading", { name: "Jezero Crater" })).toBeVisible();
  await page.getByRole("button", { name: "Next location" }).click();
  await expect(carousel.getByRole("heading", { name: "Gale Crater" })).toBeVisible();
  await expect(carousel.getByText(/Gale Crater is about 154 km across/i)).toBeVisible();
  await expect(carousel.getByText(/destination 02 \/ 03/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Interplanetary Survival Guide: Martian Map" })).toBeVisible();
  await page.getByRole("link", { name: "Explore map", exact: true }).click();
  await expect(page).toHaveURL(/\/explore\?location=gale$/);
  await expect(page.getByRole("heading", { name: "Explore Mars" })).toBeVisible();
});

test("all carousel destinations use real orbital images in the same frame", async ({ page }) => {
  await page.goto("/");
  const frame = page.getByRole("region", { name: "Mars location choices" });
  const widths: number[] = [];
  for (const name of ["Jezero Crater", "Gale Crater", "Melas Chasma"]) {
    const image = frame.getByRole("img", { name: new RegExp(name) });
    await expect(image).toBeVisible();
    const details = await image.evaluate((element, destination) => ({
      width: element.getBoundingClientRect().width,
      background: getComputedStyle(element).backgroundImage,
    }), name);
    expect(details.background).toContain("url(");
    widths.push(details.width);
    if (name !== "Melas Chasma") await page.getByRole("button", { name: "Next location" }).click();
  }
  expect(new Set(widths).size).toBe(1);
});

test("explore globe uses the full screen and opens region details from a map marker", async ({ page }) => {
  await page.goto("/explore");
  await expect(page.locator(".explore-page aside")).toHaveCount(0);
  await expect(page.getByText("DRAG TO ORBIT · SCROLL TO ZOOM")).toHaveCount(0);
  await expect(page.getByText("JEZERO CRATER / LOCAL NASA DATA")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Interactive Mars globe" })).toBeVisible();
  await expect.poll(() => page.locator(".explore-canvas-wrap canvas").evaluate((canvas) => canvas.getBoundingClientRect().width)).toBeGreaterThan(1000);
  await page.getByRole("button", { name: "Jezero Crater" }).click();
  await expect(page.getByRole("complementary", { name: "Selected location details" })).toBeVisible();
  await expect(page.getByText(/Jezero is a 45 km impact crater/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Source: NASA Science" })).toHaveAttribute("href", /nasa.gov/);
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Zoom out" }).click();
  await page.getByRole("button", { name: "Close location details" }).click();
  await expect(page.getByRole("complementary", { name: "Selected location details" })).toHaveCount(0);
  await page.getByRole("button", { name: "Jezero Crater" }).click();
  await expect(page.getByText("Coming soon")).toBeVisible();
  await expect(page.getByRole("link", { name: "Plan from Mission Command" })).toHaveCount(0);
});

test("selecting another mapped place recenters the globe and cites its source", async ({ page }) => {
  await page.goto("/explore?location=jezero");
  const gale = page.getByRole("button", { name: "Gale Crater" });
  await expect(gale).toBeVisible();
  await gale.click();
  await expect(page).toHaveURL(/location=gale/);
  await expect(page.getByRole("link", { name: "Source: NASA Science" })).toBeVisible();
  await expect.poll(async () => {
    const marker = await gale.boundingBox();
    const canvas = await page.locator(".explore-canvas-wrap canvas").first().boundingBox();
    if (!marker || !canvas) return 999;
    return Math.abs(marker.x + marker.width / 2 - (canvas.x + canvas.width / 2));
  }, { timeout: 8000 }).toBeLessThan(100);
});
