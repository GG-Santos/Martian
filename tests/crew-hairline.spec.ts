import { expect, test } from "@playwright/test";

test("create crew card uses a built-in Hairline figure", async ({ page }) => {
  await page.goto("/crew?location=jezero");
  const create = page.getByRole("button", { name: "Create a crew" });
  await expect(create.locator('[data-hairline="settle"]')).toHaveCount(1);
  await expect(create.locator('image[href="/images/crew-rocket.svg"]')).toHaveCount(0);
  await create.click();
  await expect(page.getByLabel("Crew name")).toBeVisible();
});

test("join dish fits the card and tracks the pointer outside its box", async ({ page }) => {
  await page.setViewportSize({ width: 1345, height: 649 });
  await page.goto("/crew?location=jezero");
  const join = page.getByRole("button", { name: "Join a crew" });
  const dish = join.locator('[data-hairline="dish"]');
  await expect(dish).toBeVisible();
  const cardBox = await join.boundingBox();
  const dishBox = await dish.boundingBox();
  expect(cardBox).not.toBeNull();
  expect(dishBox).not.toBeNull();
  expect(dishBox!.x).toBeGreaterThan(cardBox!.x);
  expect(dishBox!.y).toBeGreaterThan(cardBox!.y);
  expect(dishBox!.x + dishBox!.width).toBeLessThan(cardBox!.x + cardBox!.width);
  expect(dishBox!.y + dishBox!.height).toBeLessThan(cardBox!.y + cardBox!.height * 0.76);

  await page.mouse.move(30, 400);
  await expect(join.locator(".crew-linework--join")).toHaveAttribute("data-dish-read", /az \d+/);
  await join.click();
  await expect(page.getByLabel("Room code")).toBeVisible();
});
