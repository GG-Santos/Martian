import { expect, test } from "@playwright/test";

test("board content scrolls below a vertically centered fixed header", async ({ page }) => {
  await page.setViewportSize({ width: 1054, height: 649 });
  await page.goto("/board");

  const header = page.locator(".project-header");
  const brand = page.locator(".project-brand");
  const content = page.locator(".project-content");
  const headerBox = await header.boundingBox();
  const brandBox = await brand.boundingBox();
  expect(headerBox).not.toBeNull();
  expect(brandBox).not.toBeNull();
  expect(Math.abs(brandBox!.y + brandBox!.height / 2 - headerBox!.y - headerBox!.height / 2)).toBeLessThanOrEqual(2);

  await expect(page.getByText("12 quests")).toBeVisible();
  await page.mouse.move(800, 400);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  expect((await header.boundingBox())?.y).toBe(0);
});
