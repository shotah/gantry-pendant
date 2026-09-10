import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("sw.js lock-screen", () => {
  it("skips the tray when a window is visible", () => {
    const src = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");
    expect(src).toContain("visibilityState === \"visible\"");
    expect(src).toContain("addEventListener(\"push\"");
  });
});
