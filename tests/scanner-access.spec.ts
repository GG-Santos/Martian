import { expect, test } from "@playwright/test";
import { scannerCrew, terrainRequests } from "./helpers/scanner-crew";

test("anonymous scanner navigation replaces the route with crew entry without terrain requests", async ({ page }) => {
  const requests = terrainRequests(page);
  await page.goto("/board");
  await page.goto("/scanner");
  await expect(page).toHaveURL(/\/crew$/);
  await expect(page.getByRole("button", { name: "Create a crew" })).toBeVisible();
  expect(requests).toEqual([]);
  await page.goBack();
  await expect(page).toHaveURL(/\/board$/);
});

test("a setup crew returns to preparation without mounting scanner terrain", async ({ page }) => {
  await scannerCrew(page, { status: "setup" });
  const requests = terrainRequests(page);
  await page.goto("/scanner");
  await expect(page).toHaveURL(/\/crew$/);
  await expect(page.getByTestId("room-code")).toBeVisible();
  // The crew lobby may request its map imagery and slope overlay; the scanner dataset stays unmounted.
  expect(requests.filter((url) => !/(slope\.u8|optical\.webp|slope\.webp)$/.test(url))).toEqual([]);
});

for (const saved of ["{bad json", JSON.stringify({ code: "STALE1" })]) {
  test(`a malformed or incomplete saved session returns to crew: ${saved}`, async ({ page }) => {
    await page.addInitScript((value) => sessionStorage.setItem("astronaut-guild-room", value), saved);
    const requests = terrainRequests(page);
    await page.goto("/scanner");
    await expect(page).toHaveURL(/\/crew$/);
    expect(requests).toEqual([]);
  });
}

for (const memberId of [null, "absent-member"]) {
  test(`a launched snapshot without a valid current member returns to crew: ${memberId}`, async ({ page }) => {
    await scannerCrew(page, { memberId });
    const requests = terrainRequests(page);
    await page.goto("/scanner");
    await expect(page).toHaveURL(/\/crew$/);
    expect(requests.filter((url) => !/(slope\.u8|optical\.webp|slope\.webp)$/.test(url))).toEqual([]);
  });
}

test("restoration holds terrain until membership is accepted and survives scanner reload", async ({ page }) => {
  const restore = Promise.withResolvers<void>();
  await scannerCrew(page, { beforeRestore: () => restore.promise });
  const requests = terrainRequests(page);
  await page.goto("/scanner");
  try {
    await expect(page.getByRole("status")).toContainText("Restoring crew session");
    await expect(page.locator("canvas")).toHaveCount(0);
    expect(requests).toEqual([]);
  } finally { restore.resolve(); }
  await expect(page.getByRole("region", { name: "Mission planner" })).toContainText("Survey the surface contact");
  await expect(page.getByRole("button", { name: "Locate base CREW BASE" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Locate astronaut Scout" })).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(/\/scanner$/);
  await expect(page.getByRole("region", { name: "Mission planner" })).toContainText("Survey the surface contact");
  await expect(page.getByRole("button", { name: "Locate astronaut Scout" })).toBeVisible();
});
