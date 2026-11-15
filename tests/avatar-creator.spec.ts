import { expect, test, type Page } from "@playwright/test";

async function openCharacterCreator(page: Page) {
  await page.goto("/crew");
  await page.getByRole("button", { name: "Create a crew" }).click();
  await page.getByLabel("Crew name").fill("Survey team");
  await page.getByLabel("Your name").fill("Scout");
  await page.getByRole("button", { name: "Continue to mission" }).click();
  await page.getByRole("region", { name: "Mission selection" }).getByRole("button", { name: /Bundled objective/ }).first().click();
  await page.getByRole("button", { name: "Accept mission" }).click();
  await page.getByRole("button", { name: /Suggested base area:/ }).first().click();
  await page.getByRole("button", { name: "Continue to character" }).click();
}

test("character creator offers varied silhouettes, colors, and expressions", async ({ page }) => {
  await openCharacterCreator(page);

  const creator = page.getByRole("region", { name: "Customize your astronaut" });
  await expect(creator.locator(".avatar-swatch")).toHaveCount(12);
  await expect(creator.locator('[data-avatar-choice="body"]')).toHaveCount(6);
  await expect(creator.getByRole("button", { name: "Cube", exact: true })).toBeVisible();
  await expect(creator.getByRole("button", { name: "Capsule", exact: true })).toHaveCount(0);
  await expect(creator.locator('[data-avatar-choice="eyes"]')).toHaveCount(6);
  await expect(creator.locator('[data-avatar-choice="mouth"]')).toHaveCount(14);

  await creator.getByRole("button", { name: "Amber suit" }).click();
  await creator.getByRole("button", { name: "Cube", exact: true }).click();
  await creator.getByRole("button", { name: "Arched eyes" }).click();
  await creator.getByRole("button", { name: "Laugh mouth" }).click();
  await expect(creator.getByRole("button", { name: "Amber suit" })).toHaveAttribute("aria-pressed", "true");
  await expect(creator.getByRole("button", { name: "Cube", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(creator.getByRole("button", { name: "Arched eyes" })).toHaveAttribute("aria-pressed", "true");
  await expect(creator.getByRole("button", { name: "Laugh mouth" })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByTestId("room-code")).toHaveText(/^[A-Z0-9]{6}$/);
  await page.getByRole("button", { name: "Back to character" }).click();
  const lobbyCreator = page.getByRole("region", { name: "Customize your astronaut" });
  await expect(lobbyCreator.getByRole("button", { name: "Amber suit" })).toHaveAttribute("aria-pressed", "true");
  await expect(lobbyCreator.getByRole("button", { name: "Cube", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(lobbyCreator.getByRole("button", { name: "Arched eyes" })).toHaveAttribute("aria-pressed", "true");
  await expect(lobbyCreator.getByRole("button", { name: "Laugh mouth" })).toHaveAttribute("aria-pressed", "true");
});

test("character editor fills the desktop workspace without intro copy", async ({ page }) => {
  await page.setViewportSize({ width: 1345, height: 649 });
  await openCharacterCreator(page);
  const editor = page.locator(".crew-character-step");
  const editorBox = await editor.boundingBox();
  const previewBox = await editor.locator(".avatar-preview").boundingBox();
  expect(editorBox!.width).toBeGreaterThan(1200);
  expect(previewBox!.width).toBeGreaterThan(420);
  await expect(editor.getByText("Shape a field companion", { exact: false })).toHaveCount(0);
});

test("character creator stays within a narrow viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await openCharacterCreator(page);
  await expect(page.getByRole("img", { name: "3D astronaut preview" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});
