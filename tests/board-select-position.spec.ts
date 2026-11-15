import { expect, test } from "@playwright/test";

test("duration options open below the filter without covering its trigger", async ({ page }) => {
  await page.setViewportSize({ width: 1054, height: 649 });
  await page.goto("/board");

  const trigger = page.getByRole("combobox", { name: "Filter by duration" });
  await trigger.click();
  const popup = page.locator('[data-slot="select-content"]');
  await expect(popup).toBeVisible();

  const triggerBox = await trigger.boundingBox();
  const popupBox = await popup.boundingBox();
  expect(triggerBox).not.toBeNull();
  expect(popupBox).not.toBeNull();
  expect(popupBox!.y).toBeGreaterThanOrEqual(triggerBox!.y + triggerBox!.height);
  expect(Math.abs(popupBox!.x + popupBox!.width - triggerBox!.x - triggerBox!.width)).toBeLessThanOrEqual(2);
  expect(popupBox!.x + popupBox!.width).toBeLessThanOrEqual(1054);
});
