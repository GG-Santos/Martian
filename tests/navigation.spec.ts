import { expect, test } from "@playwright/test";

test("the single navigation link switches between Mission Command and the quest board", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Mission Command" })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Project navigation" });
  await expect(nav.getByRole("link")).toHaveCount(1);
  const questBoard = nav.getByRole("link", { name: "Submit a Quest" });
  await expect(questBoard).toHaveAttribute("href", "/board?submit=1");
  await expect(questBoard.locator("svg")).toHaveAttribute("aria-hidden", "true");
  await questBoard.click();
  await expect(page).toHaveURL(/\/board\?submit=1$/);
  await expect(nav.getByRole("link")).toHaveCount(1);
  const missionCommand = nav.getByRole("link", { name: "Mission Command" });
  await expect(missionCommand).toHaveAttribute("href", "/");
  await expect(missionCommand.locator("svg")).toHaveAttribute("aria-hidden", "true");
  await missionCommand.click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/crew");
  await expect(page).toHaveURL(/\/crew(?:\?location=jezero)?$/);
  await expect(page.locator(".crew-intro")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Choose how to enter a crew" })).toBeVisible();
});

test("the retired astronaut route is not supported", async ({ page }) => {
  const response = await page.goto("/astronaut");
  expect(response?.status()).toBe(404);
});
