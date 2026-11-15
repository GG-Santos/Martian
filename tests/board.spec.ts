import { test, expect } from "@playwright/test";

test("board explains the room requirement and keeps quest tools focused", async ({ page }) => {
  await page.goto("/board");
  await expect(page.getByRole("heading", { name: "Quest Board" })).toBeVisible();
  await expect(page.getByText("Join a crew to post and manage scientific quests.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Mission Command" }).last()).toHaveAttribute("href", "/");
  await expect(page.getByText("Survey the surface contact")).toBeVisible();
  await expect(page.getByText("Profile the ridge")).toBeVisible();
  await expect(page.getByText("Compare the thermal pattern")).toBeVisible();
  await expect(page.getByText("Preview only — join a crew to accept or post quests.")).toBeVisible();
});

test("crew can post and complete a scientific quest", async ({ page }) => {
  await page.goto("/board");
  await page.evaluate(async () => {
    const socket = new WebSocket(`ws://${location.host}/sync`);
    const accepted = new Promise<{ code: string; token: string }>((resolve, reject) => {
      let room: { code: string; token: string } | null = null;
      socket.onopen = () => socket.send(JSON.stringify({ type: "create", name: "Quest Tester" }));
      socket.onerror = () => reject(new Error("Could not create test crew"));
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "accepted" && !room) {
          room = { code: message.snapshot.code, token: message.token };
          socket.send(JSON.stringify({ type: "select-mission", code: room.code, expectedRevision: message.snapshot.revision, missionId: "jezero" }));
        } else if (message.type === "accepted" && room && message.snapshot.missionId === "jezero") resolve(room);
        if (message.type === "error") reject(new Error(message.message));
      };
    });
    const room = await accepted;
    sessionStorage.setItem("astronaut-guild-room", JSON.stringify(room));
    socket.close();
  });
  await page.reload();
  await expect(page.getByRole("button", { name: "Post quest" })).toBeVisible();
  await page.getByRole("button", { name: "Post quest" }).click();
  const picker = page.getByRole("button", { name: "Choose quest location on sector map" });
  await expect(picker).toBeVisible();
  const mapBox = (await picker.boundingBox())!;
  await picker.click({ position: { x: mapBox.width * 0.5, y: mapBox.height * 0.5 } });
  await expect(page.getByLabel("Map X (m)")).toHaveValue(/102[0-9]/);
  await expect(page.getByLabel("Map Y (m)")).toHaveValue(/102[0-9]/);
  const beforeKeyboardX = Number(await page.getByLabel("Map X (m)").inputValue());
  await picker.focus();
  await picker.press("ArrowRight");
  await expect(page.getByLabel("Map X (m)")).toHaveValue(String(beforeKeyboardX + 8));
  await picker.press("Enter");
  await expect(page.getByLabel("Map X (m)")).toHaveValue(String(beforeKeyboardX + 8));
  await expect(page.getByText(/Pin is a proposed field location/)).toBeVisible();
  await page.getByLabel("Title").fill("Measure ridge grain size");
  await page.getByLabel("Description").fill("Document grains at the mapped ridge.");
  await page.getByLabel("Scientific objective or hypothesis").fill("The ridge contains coarser material than nearby flats.");
  await page.getByLabel("Map X (m)").fill("1000");
  await page.getByLabel("Map Y (m)").fill("850");
  await page.getByLabel("Required equipment").fill("camera, sample kit");
  await page.getByLabel("Expected observations").fill("Images and grain counts.");
  await page.getByLabel("Completion criteria").fill("Record three images and a count.");
  await page.getByRole("button", { name: "Save draft" }).click();
  const card = page.locator(".board-card").filter({ hasText: "Measure ridge grain size" });
  await expect(card).toContainText("draft");
  await card.getByRole("button", { name: "Publish" }).click();
  await expect(card).toContainText("published");
  await expect(page.getByRole("button", { name: "Locate quest Measure ridge grain size on board map" })).toBeVisible();
  await card.getByRole("button", { name: "Accept quest" }).click();
  await expect(card).toContainText("accepted");
  await card.getByRole("button", { name: "Start quest" }).click();
  await expect(card).toContainText("in progress");
  await card.getByRole("button", { name: "Inspect quest" }).click();
  await card.getByLabel("Field note or reason").fill("Three images and 40 grains recorded.");
  await card.getByRole("button", { name: "Complete" }).click();
  await expect(card).toContainText("completed");
  await page.reload();
  await expect(page.locator(".board-card").filter({ hasText: "Measure ridge grain size" })).toContainText("completed");
  await page.evaluate(async () => {
    const saved = JSON.parse(sessionStorage.getItem("astronaut-guild-room") ?? "null");
    if (!saved) return;
    const socket = new WebSocket(`ws://${location.host}/sync`);
    await new Promise<void>((resolve, reject) => {
      let leaving = false;
      socket.onopen = () => socket.send(JSON.stringify({ type: "reconnect", code: saved.code, token: saved.token }));
      socket.onerror = () => reject(new Error("Could not clean up test crew"));
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "error") reject(new Error(message.message));
        if (message.type !== "accepted") return;
        if (leaving) { socket.close(); resolve(); return; }
        leaving = true;
        socket.send(JSON.stringify({ type: "leave", code: saved.code, expectedRevision: message.snapshot.revision }));
      };
    });
    sessionStorage.removeItem("astronaut-guild-room");
  });
});

test("a simulated mission uses its own map and does not offer a Jezero image", async ({ page }) => {
  await page.goto("/board");
  await page.evaluate(async () => {
    const socket = new WebSocket(`ws://${location.host}/sync`);
    const room = await new Promise<{ code: string; token: string }>((resolve, reject) => {
      let created: { code: string; token: string } | null = null;
      socket.onopen = () => socket.send(JSON.stringify({ type: "create", name: "Gale Tester" }));
      socket.onerror = () => reject(new Error("Could not create Gale crew"));
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "error") reject(new Error(message.message));
        if (message.type !== "accepted") return;
        if (!created) {
          created = { code: message.snapshot.code, token: message.token };
          socket.send(JSON.stringify({ type: "select-mission", code: created.code, expectedRevision: message.snapshot.revision, missionId: "gale" }));
        } else if (message.snapshot.missionId === "gale") resolve(created);
      };
    });
    sessionStorage.setItem("astronaut-guild-room", JSON.stringify(room));
    socket.close();
  });
  await page.reload();
  await expect(page.locator(".quest-sector-map.gale")).toBeVisible();
  await expect(page.getByRole("region", { name: "Quest locations" })).toContainText("Illustrative sector map · simulated terrain");
  await expect(page.getByRole("button", { name: "Post quest" })).toBeEnabled();
  await page.evaluate(async () => {
    const saved = JSON.parse(sessionStorage.getItem("astronaut-guild-room") ?? "null");
    const socket = new WebSocket(`ws://${location.host}/sync`);
    const updatedToken = await new Promise<string>((resolve, reject) => {
      let switching = false;
      socket.onopen = () => socket.send(JSON.stringify({ type: "reconnect", code: saved.code, token: saved.token }));
      socket.onerror = () => reject(new Error("Could not switch simulated sector"));
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "error") reject(new Error(message.message));
        if (message.type !== "accepted") return;
        if (!switching) {
          switching = true;
          saved.token = message.token;
          socket.send(JSON.stringify({ type: "select-mission", code: saved.code, expectedRevision: message.snapshot.revision, missionId: "valles" }));
        } else if (message.snapshot.missionId === "valles") resolve(saved.token);
      };
    });
    sessionStorage.setItem("astronaut-guild-room", JSON.stringify({ code: saved.code, token: updatedToken }));
    socket.close();
  });
  await page.reload();
  await expect(page.locator(".quest-sector-map.valles")).toBeVisible();
  await expect(page.getByRole("region", { name: "Quest locations" })).toContainText("Melas Chasma");
  await page.goto("/crew");
  await page.getByRole("button", { name: "Leave crew" }).click();
});
