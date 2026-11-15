import { expect, test } from "@playwright/test";

test("crew entry chooses create or join before the character step", async ({ page }) => {
  await page.goto("/crew");
  await expect(page.getByRole("region", { name: "Choose how to enter a crew" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Choose a crew path" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Customize your astronaut" })).toHaveCount(0);
  await expect(page.getByLabel("Your name")).toHaveCount(0);

  await page.getByRole("button", { name: "Join a crew" }).click();
  await expect(page.getByLabel("Room code")).toBeVisible();
  await expect(page.getByLabel("Crew name")).toHaveCount(0);
  await page.getByLabel("Room code").fill("ABC123");
  await page.getByLabel("Your name").fill("Sam");
  await expect(page.getByRole("button", { name: "Continue to character" })).toBeDisabled();
  await expect(page.getByRole("region", { name: "Customize your astronaut" })).toHaveCount(0);

  await page.getByRole("button", { name: "Switch to starting a crew" }).click();
  await page.getByLabel("Crew name").fill("Delta Survey");
  await page.getByLabel("Your name").fill("Scout");
  await page.getByRole("button", { name: "Continue to mission" }).click();
  await expect(page.getByRole("region", { name: "Mission selection" })).toBeVisible();
  await page.getByRole("region", { name: "Mission selection" }).getByRole("button", { name: /Bundled objective/ }).first().click();
  await page.getByRole("button", { name: "Accept mission" }).click();
  await page.getByRole("button", { name: /Suggested base area:/ }).first().click();
  await page.getByRole("button", { name: "Continue to character" }).click();
  await expect(page.getByRole("region", { name: "Customize your astronaut" })).toBeVisible();
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByTestId("room-code")).toHaveText(/^[A-Z0-9]{6}$/);
  await expect(page.getByText("Delta Survey")).toBeVisible();
  await page.getByRole("button", { name: "Disband Crew" }).click();
  await page.getByRole("button", { name: "Disband crew", exact: true }).click();
});

test("the two crew choices use the available desktop height without scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 1345, height: 649 });
  await page.goto("/crew");
  const create = page.getByRole("button", { name: "Create a crew" });
  const join = page.getByRole("button", { name: "Join a crew" });
  const createBox = await create.boundingBox();
  const joinBox = await join.boundingBox();
  expect(createBox).not.toBeNull();
  expect(joinBox).not.toBeNull();
  expect(createBox!.height).toBeGreaterThan(200);
  expect(joinBox!.height).toBeGreaterThan(200);
  expect(joinBox!.x).toBeGreaterThan(createBox!.x + createBox!.width);
  const scroll = await page.locator(".project-content").evaluate((element) => ({ client: element.clientHeight, content: element.scrollHeight }));
  expect(scroll.content).toBeLessThanOrEqual(scroll.client + 1);

  await create.click();
  const detailsScroll = await page.locator(".project-content").evaluate((element) => ({ client: element.clientHeight, content: element.scrollHeight }));
  expect(detailsScroll.content).toBeLessThanOrEqual(detailsScroll.client + 1);
});

test("crew choice and join step fit a narrow screen", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await page.goto("/crew");
  await expect(page.getByRole("button", { name: "Create a crew" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Join a crew" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const scroll = await page.locator(".project-content").evaluate((element) => ({ client: element.clientHeight, content: element.scrollHeight }));
  expect(scroll.content).toBeLessThanOrEqual(scroll.client + 1);

  await page.getByRole("button", { name: "Join a crew" }).click();
  await expect(page.getByLabel("Room code")).toBeVisible();
  await expect(page.getByRole("region", { name: "Customize your astronaut" })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  const detailsScroll = await page.locator(".project-content").evaluate((element) => ({ client: element.clientHeight, content: element.scrollHeight }));
  expect(detailsScroll.content).toBeLessThanOrEqual(detailsScroll.client + 1);
});
