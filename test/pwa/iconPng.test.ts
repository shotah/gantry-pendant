import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { pendantPng, pngSize, PWA_ICON_FILES, writePendantIcons } from "@/lib/pwa/iconPng";

function samePng(disk: string, bytes: Uint8Array) {
  expect(Buffer.from(readFileSync(disk)).equals(Buffer.from(bytes))).toBe(true);
}

describe("iconPng", () => {
  it("encodes square PNG at Chrome's sizes", () => {
    expect(pngSize(pendantPng(192, "any"))).toEqual({ width: 192, height: 192 });
    expect(pngSize(pendantPng(512, "any"))).toEqual({ width: 512, height: 512 });
    expect(pngSize(pendantPng(512, "maskable"))).toEqual({ width: 512, height: 512 });
    expect(pngSize(pendantPng(180, "apple"))).toEqual({ width: 180, height: 180 });
    expect(pngSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it("rejects a tiny size", () => {
    expect(() => pendantPng(8, "any")).toThrow(/icon size/);
  });

  it("writes the four public files", () => {
    const dir = mkdtempSync(join(tmpdir(), "pendant-pwa-"));
    expect(writePendantIcons(dir)).toEqual(Object.keys(PWA_ICON_FILES));
    expect(pngSize(readFileSync(join(dir, "icon-192.png")))).toEqual({ width: 192, height: 192 });
  });

  it("keeps public/ in sync with the generator", () => {
    samePng("public/icon-192.png", PWA_ICON_FILES["icon-192.png"]());
    samePng("public/icon-512.png", PWA_ICON_FILES["icon-512.png"]());
    samePng("public/icon-maskable-512.png", PWA_ICON_FILES["icon-maskable-512.png"]());
    samePng("public/apple-touch-icon.png", PWA_ICON_FILES["apple-touch-icon.png"]());
  });
});
