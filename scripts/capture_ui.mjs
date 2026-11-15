import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const browser = await chromium.launch({ channel: "chrome", args: ["--enable-unsafe-swiftshader"] });
await mkdir("docs/screenshots/atlas", { recursive: true });
for (const viewport of [{ width: 1440, height: 900, name: "desktop" }, { width: 390, height: 844, name: "mobile" }]) {
  const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
  for (const [route, name] of [["/", "home"], ["/explore", "explore"], ["/crew", "crew"], ["/astronaut", "astronaut"], ["/board", "board"]]) {
    await page.goto(`http://127.0.0.1:3000${route}`);
    if (route === "/explore") await page.getByRole("button", { name: "Jezero Crater" }).waitFor({ state: "visible", timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `docs/screenshots/atlas/${name}-${viewport.name}.png`, fullPage: true });
    console.log(`${name}-${viewport.name}: ${await page.title()} | overflow ${await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)}`);
  }
  await page.close();
}
await browser.close();
