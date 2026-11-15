import { expect, test } from "@playwright/test";

test("location tooltips activate on click or keyboard, not hover or focus", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Jezero Crater" })).toBeVisible();

  const location = page.locator(".globe-location.secondary:visible").first();
  await expect(location).toBeVisible();
  const locationName = (await location.innerText()).trim();
  await location.hover();
  await expect(page.getByRole("heading", { name: "Jezero Crater" })).toBeVisible();
  await location.focus();
  await expect(page.getByRole("heading", { name: "Jezero Crater" })).toBeVisible();
  await location.click();
  await expect(page.getByRole("heading", { name: locationName })).toBeVisible();

  const nextLocation = page.locator(".globe-location.secondary:visible").first();
  await expect(nextLocation).toBeVisible();
  const nextName = (await nextLocation.innerText()).trim();
  await nextLocation.focus();
  await expect(page.getByRole("heading", { name: locationName })).toBeVisible();
  await nextLocation.press("Enter");
  await expect(page.getByRole("heading", { name: nextName })).toBeVisible();
});
