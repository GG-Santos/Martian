import { expect, test } from "@playwright/test";
import { scannerCrew } from "./helpers/scanner-crew";

test.beforeEach(async ({ page }) => { await scannerCrew(page); });

test("physical view uses true-scale relief and fills the workspace", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/scanner");
  await expect(
    page.getByRole("status").filter({ hasText: "4 m mesh" }),
  ).toBeVisible();
  const map = page.locator(".map-viewport");
  const normal = (await map.boundingBox())!;
  expect(normal.height).toBeGreaterThan(450);
  expect(
    await page.evaluate(() => document.documentElement.scrollHeight),
  ).toBeLessThanOrEqual(902);
  await expect(page.getByTestId("crew-route-status")).toContainText("round trip");
  const distance = await page.getByTestId("crew-route-status").innerText();
  await page.getByRole("button", { name: "Physical", exact: true }).click();
  await expect(page.getByRole("button", { name: "Physical", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.getByRole("status").filter({ hasText: "Relief 1×" }),
  ).toBeVisible();
  await expect(page.getByLabel("Relief scale")).toBeDisabled();
  await expect(page.getByTestId("crew-route-status")).toHaveText(distance);
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Exit full screen" }),
  ).toBeVisible();
  expect((await map.boundingBox())!.height).toBeGreaterThan(normal.height);
  await page.getByRole("button", { name: "Exit full screen" }).click();
  await page.getByRole("button", { name: "Surface", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Relief 3×" }),
  ).toBeVisible();
});

test("workspace expands inside an embedded browser without native fullscreen", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = () =>
      Promise.reject(new DOMException("Blocked by embed"));
  });
  await page.goto("/scanner");
  await page.getByRole("button", { name: "Full screen", exact: true }).click();
  const expanded = page.getByRole("button", { name: "Exit full screen" });
  await expect(expanded).toBeVisible();
  const bounds = (await page.locator(".workspace").boundingBox())!;
  expect(bounds.x).toBe(0);
  expect(bounds.y).toBe(0);
  expect(bounds.height).toBe(page.viewportSize()!.height);
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "Full screen", exact: true }),
  ).toBeVisible();
});

test("scanner views preserve the shared plan and physical readings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error" && /THREE|shader/i.test(message.text()))
      errors.push(message.text());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/scanner");
  await expect(
    page.getByRole("status").filter({ hasText: "4 m mesh" }),
  ).toBeVisible();
  await page.getByText("Optional map objectives", { exact: true }).click();
  await page.getByRole("button", { name: "Add Profile the ridge" }).click();
  await expect(page.getByRole("list", { name: "Visit order" })).toContainText("Profile the ridge");
  await expect(page.getByTestId("crew-route-status")).toContainText("round trip");
  const distance = await page.getByTestId("crew-route-status").innerText();
  const duration = await page.getByRole("region", { name: "Selected route budget" }).innerText();
  await page.getByRole("button", { name: "Top down", exact: true }).click();
  await expect(page.getByLabel("North up")).toBeVisible();
  for (const name of ["Mesh", "Points", "Surface"]) {
    const mode = page.getByRole("button", { name, exact: true });
    await mode.click();
    await expect(mode).toHaveAttribute("aria-pressed", "true");
  }
  await page.getByLabel("Relief scale").selectOption("5");
  await expect(
    page.getByRole("status").filter({ hasText: "Relief 5×" }),
  ).toBeVisible();
  for (const name of ["Grid", "Contours"]) {
    const toggle = page.getByRole("button", { name, exact: true });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
  }
  for (const [layer, units] of [
    ["Terrain slope", "Slope (°)"],
    ["Elevation", "Elevation (m)"],
    ["Thermal context", "Relative IR brightness (DN)"],
  ]) {
    await page.getByRole("button", { name: layer, exact: true }).click();
    await expect(
      page.getByRole("group", { name: units, exact: true }),
    ).toBeVisible();
  }
  await expect(page.getByRole("group", { name: "Slope (°)" })).toHaveCount(0);
  await expect(page.getByTestId("crew-route-status")).toHaveText(distance);
  await expect(page.getByRole("region", { name: "Selected route budget" })).toHaveText(duration, { useInnerText: true });
  await expect(
    page.getByRole("button", { name: "Locate base CREW BASE" }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("damaged relief leaves the 8 m mesh and shared planner available", async ({
  page,
}) => {
  await page.route("**/relief.f32", (route) =>
    route.fulfill({ body: "invalid" }),
  );
  await page.goto("/scanner");
  await expect(
    page.getByRole("status").filter({ hasText: "8 m mesh" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Locate base CREW BASE" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /Efficient.*m round trip/ })).toBeEnabled();
});

test("missing optical imagery leaves grayscale terrain available", async ({
  page,
}) => {
  await page.route("**/optical.webp", (route) =>
    route.fulfill({ status: 404, body: "missing" }),
  );
  await page.goto("/scanner");
  await page.getByRole("button", { name: "Optical imagery" }).click();
  await expect(page.getByText("Optical imagery unavailable")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Locate base CREW BASE" }),
  ).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
});

test("point mode can inspect the shared surface with survey overlays off", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/scanner");
  await page.getByRole("button", { name: "Top down" }).click();
  await page.getByRole("button", { name: "Points", exact: true }).click();
  await page.getByRole("button", { name: "Grid", exact: true }).click();
  await page.getByRole("button", { name: "Contours", exact: true }).click();
  await page.getByRole("button", { name: "Inspect", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "4 m mesh" }),
  ).toBeVisible();
  const canvas = page.locator("canvas");
  const size = (await canvas.boundingBox())!;
  await canvas.click({
    position: { x: size.width * 0.53, y: size.height * 0.32 },
  });
  await expect(page.locator(".probe-card")).toContainText("Mars 2000");
});

test("narrow screens start north-up with accessible scanner controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/scanner");
  const top = page.getByRole("button", { name: "Top down" });
  await expect(top).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("North up")).toBeVisible();
  const habitat = page.getByRole("button", { name: "Locate base CREW BASE" });
  await expect(habitat).toBeVisible();
  const before = (await habitat.boundingBox())!;
  const canvas = (await page.locator("canvas").boundingBox())!;
  const touch = await page.context().newCDPSession(page);
  const x = Math.round(canvas.x + canvas.width * 0.6);
  const y = Math.round(canvas.y + canvas.height * 0.35);
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: x + 30, y }],
  });
  await touch.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await expect
    .poll(async () => Math.abs((await habitat.boundingBox())!.x - before.x))
    .toBeGreaterThan(10);
  const mesh = page.getByRole("button", { name: "Mesh", exact: true });
  await mesh.focus();
  await mesh.press("Enter");
  await expect(mesh).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("Relief scale")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
