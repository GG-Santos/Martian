import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("QuestStore in the custom Node server", () => {
  it("loads with Node's built-in TypeScript stripping", () => {
    const moduleUrl = new URL("./quest-store.ts", import.meta.url).href;

    expect(() => execFileSync(process.execPath, [
      "--experimental-strip-types",
      "--input-type=module",
      "--eval",
      `await import(${JSON.stringify(moduleUrl)})`,
    ])).not.toThrow();
  });
});
