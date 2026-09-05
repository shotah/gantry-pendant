/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { jpegFromFile } from "@/app/lib/jpegFromFile";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jpegFile(over: Partial<{ type: string; size: number }> = {}): File {
  const bytes = new Uint8Array(64);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  return new File([bytes], "a.jpg", { type: over.type ?? "image/jpeg" });
}

describe("jpegFromFile", () => {
  it("passes through a small jpeg", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 64, height: 64, close() {} }));
    const file = jpegFile();
    expect(await jpegFromFile(file)).toBe(file);
  });

  it("rejects unreadables", async () => {
    vi.stubGlobal("createImageBitmap", async () => {
      throw new Error("nope");
    });
    await expect(jpegFromFile(jpegFile())).rejects.toThrow(/could not read/);
  });

  it("encodes a wide image down to jpeg", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 2000, height: 100, close() {} }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb) {
      cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }));
    });
    const blob = await jpegFromFile(jpegFile({ type: "image/png" }));
    expect(blob.type).toBe("image/jpeg");
  });

  it("fails when the canvas cannot encode", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 2000, height: 100, close() {} }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    await expect(jpegFromFile(jpegFile({ type: "image/png" }))).rejects.toThrow(/encode/);
  });
});
