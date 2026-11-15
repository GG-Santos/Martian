import { scannerCrew } from "./helpers/scanner-crew";
import { expect, test } from "@playwright/test";

test("terrain zones distinguish measured caution, scenarios, and unknowns", async ({
  page,
}) => {
  await scannerCrew(page);
  await page.goto("/scanner");
  await expect(page.getByRole("button", { name: "Terrain zones" })).toHaveAttribute("aria-pressed", "true");
  const legend = page.getByRole("region", { name: "Terrain zones" });
  await expect(legend.getByText("Safe Zone", { exact: true })).toBeVisible();
  await expect(legend.getByText("Caution Zone", { exact: true })).toBeVisible();
  await expect(legend.getByText("Hazard Zone", { exact: true })).toBeVisible();
  await expect(legend.getByText("Unknown Zone", { exact: true })).toBeVisible();
  await expect(legend.getByText(/illustrative.*not certified/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Inspect zone/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /Inspect zone/ }).first().click();
  await expect(page.getByRole("heading", { name: "Zone assessment" })).toBeVisible();
  await expect(legend.getByText(/Terrain-derived|Reviewed scenario/)).toBeVisible();
});
