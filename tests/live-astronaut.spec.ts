import { expect, test } from "@playwright/test";
import { defaultAvatar } from "../src/features/avatar/avatar-types";
import type { RoomSnapshot, ServerMessage } from "../src/features/session/protocol";
import type { Quest } from "../src/features/quests/quest-types";

test.afterEach(async ({ page }) => {
  await page.goto("/crew");
  const leave = page.getByRole("button", { name: "Leave crew" });
  if (await leave.isVisible()) await leave.click();
});

test("launch opens the unified scanner with live crew controls", async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto("/crew");
  await page.getByRole("button", { name: "Create a crew" }).click();
  await page.getByLabel("Crew name").fill("Scout Survey");
  await page.getByLabel("Your name").fill("Scout");
  await page.getByRole("button", { name: "Continue to mission" }).click();
  await page.getByRole("region", { name: "Mission selection" }).getByRole("button", { name: /Bundled objective/ }).first().click();
  await page.getByRole("button", { name: "Accept mission" }).click();
  await page.getByRole("radio", { name: /^1 astronaut/ }).check();
  await page.getByRole("button", { name: /Suggested base area:/ }).first().click();
  await page.getByRole("button", { name: "Continue to character" }).click();
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(page.getByTestId("room-code")).toHaveText(/^[A-Z0-9]{6}$/);
  const seededHazards = await page.locator(".crew-base-hazard-chip:not(.crew-base-hazard-chip--slope) > span").allTextContents();
  expect(seededHazards.length).toBeGreaterThan(0);
  await page.getByRole("button", { name: "Launch expedition" }).click();
  await expect(page).toHaveURL(/\/scanner$/);
  await expect(page.getByRole("heading", { name: "Jezero terrain scanner" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Limited planning" })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Project navigation" })).toBeVisible();
  const terrain = page.getByRole("region", { name: "Martian terrain" });
  await expect(terrain.getByText(/Derived terrain.*NASA HiRISE/)).toBeVisible();
  const planner = page.getByRole("region", { name: "Mission planner" });
  for (const profile of ["Efficient", "Lower exposure"]) {
    const option = planner.getByRole("button", { name: new RegExp(profile + ".*m round trip") });
    await expect(option).toContainText(/min total.*O₂.*Battery/);
  }
  await expect(planner.getByText(/Return reserve.*O₂.*battery/i)).toBeVisible();
  const scenario = page.getByRole("region", { name: "Dust scenario" });
  await scenario.getByLabel("Solar longitude Ls (°)").fill("155");
  await scenario.getByRole("button", { name: "Apply season" }).click();
  await scenario.getByRole("combobox", { name: "Dust scenario" }).selectOption("jezero-my36-2022-01-08-ds1");
  await expect(scenario.getByTestId("dust-frame")).toContainText("Historical replay · Measured");
  await scenario.getByRole("button", { name: "Step 0.5 sol" }).click();
  await expect(scenario.getByTestId("dust-frame")).toContainText("Historical replay · Interpolated");
  await scenario.getByLabel("Solar longitude Ls (°)").fill("270");
  await scenario.getByRole("button", { name: "Apply season" }).click();
  await planner.getByText("Optional map objectives", { exact: true }).click();
  await planner.getByRole("button", { name: "Add Compare the thermal pattern" }).click();
  await expect(planner.getByRole("list", { name: "Visit order" })).toContainText("Compare the thermal pattern");
  await scenario.getByRole("combobox", { name: "Dust scenario" }).selectOption("modeled-central-v1");
  await expect(scenario.getByTestId("dust-frame")).toContainText("Modeled dust envelope");
  const budget = planner.getByRole("region", { name: "Selected route budget" });
  const routeStatus = page.getByTestId("crew-route-status");
  const initialBudget = await budget.getByTestId("storm-delay").innerText();
  const initialExposure = await routeStatus.getAttribute("data-dust-exposed-segments");
  const taskAssessment = planner.getByTestId("objective-assessment");
  const initialAssessment = await taskAssessment.allTextContents();
  expect(initialAssessment).toHaveLength(2);
  let assessmentChanged = false;
  for (let step = 1; step <= 6; step++) {
    await scenario.getByRole("button", { name: "Step 0.5 sol" }).click();
    await expect(scenario.getByTestId("simulation-time")).toContainText((step / 2).toFixed(2));
    assessmentChanged ||= JSON.stringify(await taskAssessment.allTextContents()) !== JSON.stringify(initialAssessment);
    if (assessmentChanged && await routeStatus.getAttribute("data-dust-exposed-segments") !== initialExposure
      && await budget.getByTestId("storm-delay").innerText() !== initialBudget) break;
  }
  expect(assessmentChanged).toBe(true);
  await expect(budget.getByTestId("storm-delay")).not.toHaveText(initialBudget);
  await expect(routeStatus).not.toHaveAttribute("data-dust-exposed-segments", initialExposure!);

  await expect(page.getByTestId("crew-route-status")).toContainText(/round trip.*illustrative candidate/);
  await expect(page.getByRole("button", { name: "Locate base CREW BASE" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Inspect quest Survey the surface contact/ }).first()).toBeVisible();
  const crewHazardMarkers = page.locator(".hazard-marker[data-scenario-kind]");
  await expect(crewHazardMarkers.first()).toBeVisible();
  const crewHazardLabels = await crewHazardMarkers.evaluateAll((elements) => elements.map((element) => element.getAttribute("aria-label") ?? ""));
  for (const hazard of seededHazards) expect(crewHazardLabels.join(" | ")).toContain(hazard);
  await expect(page.locator('.hazard-marker[aria-label*="Steep terrain"]').first()).toBeVisible();
  const live = page.getByRole("region", { name: "Live expedition" });
  await expect(live.getByText("Field coordination")).toBeVisible();
  const status = page.getByRole("region", { name: "Field status" });
  await expect(status.getByText("CREW", { exact: true })).toBeVisible();
  await expect(status.getByText("1 / 1")).toBeVisible();
  await expect(status.getByText("SUIT O₂")).toBeVisible();
  await expect(status.getByText("100.0%", { exact: true })).toHaveCount(2);
  await expect(status.getByText("STAMINA", { exact: true })).toBeVisible();
  await expect(status.getByText("ACTIVE TASKS", { exact: true })).toBeVisible();
  await expect(status.getByText("CREW NETWORK", { exact: true })).toBeVisible();
  await expect(status.getByText("CONNECTED")).toBeVisible();
  const radiation = live.getByRole("button", { name: "Simulate radiation rise" });
  await radiation.click();
  await expect(live.getByRole("button", { name: "Clear radiation scenario" })).toHaveAttribute("aria-pressed", "true");
  await expect(live.getByText(/Route estimates do not model radiation dose/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Locate astronaut Scout" })).toBeVisible();
  const scenarioMarker = page.locator(".hazard-marker[data-scenario-kind]").first();
  await expect(scenarioMarker).toBeVisible();
  const scenarioKind = await scenarioMarker.getAttribute("data-scenario-kind");
  const scenarioColor = await scenarioMarker.evaluate((element) => getComputedStyle(element).getPropertyValue("--hazard-color").trim());
  const scenarioPalette: Record<string, string> = { heat: "#f0a060", dust: "#e4cb85", chemical: "#8cc5a9", radiation: "#d99bc1", rockfall: "#d58b73", storm: "#b7a2e6" };
  expect(scenarioPalette[scenarioKind ?? ""]).toBe(scenarioColor);
  await expect(live.getByText(/O₂ 100% · stamina 100%/)).toBeVisible();
  await live.getByLabel("Crew proximity radius").selectOption("25");
  await expect(live.getByLabel("Crew proximity radius")).toHaveValue("25");
  await page.waitForTimeout(1200);
  await live.getByRole("button", { name: "East", exact: true }).click();
  await expect(live.getByRole("button", { name: /Scout · you/ })).not.toContainText("420 E / 420 N");
  await expect(live.getByText(/stamina 99\.\d%/)).toBeVisible();
});

test("two crew members share the round trip and its reordered objectives", async ({ page: host, browser }) => {
  test.setTimeout(90_000);
  const guest = await browser.newPage();
  const scenarioRequested = Promise.withResolvers<void>();
  const releaseScenario = Promise.withResolvers<void>();
  let failScenario = false;
  await guest.route("**/data/jezero/scenario.json", async (route) => {
    if (failScenario) {
      await route.fulfill({ status: 503 });
      return;
    }
    scenarioRequested.resolve();
    await releaseScenario.promise;
    await route.continue();
  });
  try {
    await host.goto("/crew");
    await host.getByRole("button", { name: "Create a crew" }).click();
    await host.getByLabel("Crew name").fill("Round Trip Crew");
    await host.getByLabel("Your name").fill("Ari");
    await host.getByRole("button", { name: "Continue to mission" }).click();
    await host.getByRole("region", { name: "Mission selection" }).getByRole("button", { name: /Survey the surface contact/ }).click();
    await host.getByRole("button", { name: "Accept mission" }).click();
    await host.getByRole("radio", { name: /^2 astronauts/ }).check();
    await host.getByRole("button", { name: /Suggested base area:/ }).first().click();
    await host.getByRole("button", { name: "Continue to character" }).click();
    await host.getByRole("button", { name: "Create room" }).click();
    await expect(host.getByTestId("room-code")).toHaveText(/^[A-Z0-9]{6}$/);

    await guest.goto("/crew");
    await guest.getByRole("button", { name: "Join a crew" }).click();
    await guest.getByLabel("Room code").fill(await host.getByTestId("room-code").innerText());
    await guest.getByLabel("Your name").fill("Bea");
    await guest.getByRole("button", { name: "Continue to character" }).click();
    await guest.getByRole("button", { name: "Join crew" }).click();
    await guest.getByRole("button", { name: "Ready" }).click();
    await host.getByRole("button", { name: "Launch expedition" }).click();
    await expect(guest).toHaveURL(/\/scanner$/);

    const hostPlan = host.getByRole("region", { name: "Mission planner" });
    const guestPlan = guest.getByRole("region", { name: "Mission planner" });
    const hostOrder = hostPlan.getByRole("list", { name: "Visit order" });
    const guestOrder = guestPlan.getByRole("list", { name: "Visit order" });
    const ridge = "Profile the ridge";
    const thermal = "Compare the thermal pattern";

    const route = host.getByTestId("crew-route-status");
    const guestRoute = guest.getByTestId("crew-route-status");
    await scenarioRequested.promise;
    await expect(hostPlan.getByRole("button", { name: /Efficient.*m round trip/ })).toBeVisible();
    await expect(guestRoute).toContainText("Verifying fixed hazards");
    await expect(guestRoute).not.toHaveAttribute("data-route-nodes", /.+/);
    releaseScenario.resolve();
    const initialGeometry = await route.getAttribute("data-route-nodes");
    expect(JSON.parse(initialGeometry ?? "[]").length).toBeGreaterThan(3);
    await expect(guestRoute).toHaveAttribute("data-route-nodes", initialGeometry!);
    const budget = hostPlan.getByRole("region", { name: "Selected route budget" });
    for (const name of ["Ari", "Bea"]) {
      const resources = budget.getByRole("group", { name });
      await expect(resources).toContainText(/Start.*O₂ 100.0%.*Battery 100.0%/);
      await expect(resources).toContainText(/Expected use.*O₂.*Battery/);
    }
    await budget.getByText("Budget assumptions", { exact: true }).click();
    await expect(budget).toContainText("0.5 m/s");
    await expect(budget).toContainText("0.3 percentage points per EVA minute");
    await expect(budget).toContainText("0.2 percentage points per EVA minute");
    await expect(budget).toContainText("1.25×");
    await expect(budget).toContainText("1.1–1.5×");
    await expect(hostPlan.getByRole("button", { name: /Lower exposure.*m round trip/ })).toBeVisible();
    await host.getByRole("button", { name: "Inspect quest " + ridge, exact: true }).click();
    await host.getByRole("button", { name: "Add to shared plan" }).click();
    await expect(guestOrder.getByText(ridge, { exact: true })).toBeVisible();
    await guestPlan.getByText("Optional map objectives", { exact: true }).click();
    await guestPlan.getByRole("button", { name: "Add " + thermal }).click();
    await expect(hostOrder.getByText(thermal, { exact: true })).toBeVisible();
    await guestPlan.getByRole("button", { name: "Move " + thermal + " earlier" }).click();
    await expect(hostOrder.getByRole("listitem").nth(2)).toContainText(thermal);
    await hostPlan.getByRole("button", { name: /Lower exposure.*m round trip/ }).click();
    await expect(guestPlan.getByRole("button", { name: /Lower exposure.*m round trip/ })).toHaveAttribute("aria-pressed", "true");

    await expect(route).toHaveAttribute("data-route-preference", "lower-exposure");
    await expect(guestRoute).toHaveAttribute("data-route-preference", "lower-exposure");
    await expect(guestRoute).toHaveText(await route.innerText());
    const sharedGeometry = await route.getAttribute("data-route-nodes");
    expect(sharedGeometry).toBeTruthy();
    await expect(guestRoute).toHaveAttribute("data-route-nodes", sharedGeometry!);
    const originalRoute = await route.innerText();
    await host.getByRole("combobox", { name: "Dust scenario" }).selectOption("modeled-high-v1");
    await expect(route).toHaveText(originalRoute);
    await expect(guestRoute).toHaveText(originalRoute);
    const base = await route.getAttribute("data-route-start");
    expect(base).toBeTruthy();
    for (const overlayRoute of [route, guestRoute]) {
      await expect(overlayRoute).toHaveAttribute("data-route-start", base!);
      await expect(overlayRoute).toHaveAttribute("data-route-end", base!);
    }
    for (const order of [hostOrder, guestOrder]) {
      const stops = order.getByRole("listitem");
      await expect(stops).toHaveCount(5);
      await expect(stops.nth(0)).toContainText("Depart crew base");
      await expect(stops.nth(1)).toContainText("Survey the surface contact");
      await expect(stops.nth(2)).toContainText(thermal);
      await expect(stops.nth(3)).toContainText(ridge);
      await expect(stops.nth(4)).toContainText("Return to crew base");
      await expect(stops.nth(4).getByTestId("route-base-coordinates")).toHaveText(await stops.nth(0).getByTestId("route-base-coordinates").innerText());
    }
    failScenario = true;
    await guest.reload();
    await expect(guestRoute).toContainText("Fixed hazard data unavailable");
    await expect(guestRoute).not.toHaveAttribute("data-route-nodes", /.+/);
    await expect(guestPlan.getByRole("status")).toContainText("Fixed hazard data unavailable");
    await expect(route).toHaveAttribute("data-route-nodes", sharedGeometry!);
  } finally {
    releaseScenario.resolve();
    await guest.close();
  }
});

test("an unsupported launched site keeps crew context without rendering Jezero terrain", async ({ page }) => {
  const mission: Quest = {
    id: "gale-mission", roomCode: "GALE01", datasetId: "gale", source: "crew",
    status: "published", createdBy: "captain", assignedMemberIds: [],
    title: "Review Gale outcrops", description: "Compare nearby rock exposures.",
    hypothesis: "Layer thickness varies.", point: { x: 680, y: 440 },
    equipment: [], recommendedCrewSize: 1, durationMin: 30, difficulty: "low",
    hazards: [], expectedObservations: "Layer thickness", completionCriteria: "Two measurements",
    provenance: "Simulated Gale sector", completion: null, resolution: null,
  };
  const snapshot: RoomSnapshot = {
    code: "GALE01", crewName: "Gale Survey", revision: 2, status: "launched",
    members: [{ id: "captain", name: "Rover", role: "Captain", isHost: true, ready: true, connected: true, joinedAt: 0, avatar: defaultAvatar }],
    base: { x: 600, y: 420 }, capacity: 1, missionId: "gale", mission,
    positions: { captain: { x: 600, y: 420 } },
    resources: { captain: { oxygen: 100, battery: 100, stamina: 100, equipment: [] } },
    quests: [{ ...mission, id: "gale-task", title: "Count exposed layers", status: "in-progress" }],
    activeQuestIds: ["gale-task"],
    expeditionPlan: { primaryObjectiveId: mission.id, optionalObjectiveIds: [], routePreference: "efficient" },
    simulation: { scenarioId: null, startLs: 0, elapsedSol: 0, playing: false },
  };
  // New crews can currently select Jezero only. Simulate reconnecting to a launched Gale snapshot.
  const reconnect = Promise.withResolvers<void>();
  const restore = Promise.withResolvers<void>();
  const retry = Promise.withResolvers<string>();
  let reconnectAttempts = 0;
  const jezeroRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/data/jezero/")) jezeroRequests.push(request.url());
  });
  await page.addInitScript(() => sessionStorage.setItem("astronaut-guild-room", JSON.stringify({ code: "GALE01", token: "fixture" })));
  await page.routeWebSocket("**/api/sync", (socket) => {
    socket.onMessage(async (data) => {
      const command = JSON.parse(String(data));
      if (command.type === "reconnect") {
        if (++reconnectAttempts === 1) {
          socket.send(JSON.stringify({ type: "error", code: "rejected", message: "Temporary room repository failure" }));
          reconnect.resolve();
          return;
        }
        retry.resolve(command.token);
        await restore.promise;
        const message: ServerMessage = { type: "accepted", snapshot, memberId: "captain" };
        socket.send(JSON.stringify(message));
      }
    });
  });

  await page.goto("/scanner");
  await reconnect.promise;
  try {
    await expect(page.getByRole("status")).toHaveText(/Restoring crew session|Crew connection unavailable/);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("astronaut-guild-room") ?? "null")?.token)).toBe("fixture");
    expect(await retry.promise).toBe("fixture");
    await expect(page.getByRole("heading", { name: "Jezero terrain scanner" })).toHaveCount(0);
    expect(jezeroRequests).toEqual([]);
  } finally {
    restore.resolve();
  }
  const limited = page.getByRole("region", { name: "Limited planning" });
  await expect(limited.getByRole("status")).toContainText(/Gale crater has no registered terrain grid/);
  const shared = limited.getByRole("region", { name: "Shared expedition details" });
  await expect(shared).toContainText("Gale Survey");
  await expect(shared).toContainText("Rover");
  await expect(shared).toContainText("600 E / 420 N m");
  await expect(shared).toContainText("Review Gale outcrops");
  await expect(shared).toContainText("Count exposed layers · in-progress");
  await expect(page.getByRole("heading", { name: "Jezero terrain scanner" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Martian terrain" })).toHaveCount(0);
  await expect(page.getByTestId("crew-route-status")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Dust scenario" })).toHaveCount(0);
  expect(jezeroRequests).toEqual([]);
});

for (const code of ["invalid-reconnect-token", "room-not-found"]) {
  test(`a confirmed ${code} clears the saved crew and returns to crew entry`, async ({ page }) => {
    const terrainRequests: string[] = [];
    page.on("request", (request) => {
      if (new URL(request.url()).pathname.startsWith("/data/jezero/")) terrainRequests.push(request.url());
    });
    await page.addInitScript(() => sessionStorage.setItem("astronaut-guild-room", JSON.stringify({ code: "STALE1", token: "stale-token" })));
    await page.routeWebSocket("**/api/sync", (socket) => {
      socket.onMessage((data) => {
        if (JSON.parse(String(data)).type === "reconnect") {
          socket.send(JSON.stringify({ type: "error", code, message: "Crew session unavailable" }));
        }
      });
    });

    await page.goto("/scanner");
    await expect(page).toHaveURL(/\/crew$/);
    await expect(page.getByRole("button", { name: "Create a crew" })).toBeVisible();
    expect(terrainRequests).toEqual([]);
    expect(await page.evaluate(() => sessionStorage.getItem("astronaut-guild-room"))).toBeNull();
  });
}
