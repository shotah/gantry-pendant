/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import { fileFromClipboard, fileToPhoto } from "@/app/lib/photo";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fileFromClipboard", () => {
  it("returns the first image file and ignores empty or non-image pastes", () => {
    const img = new File([new Uint8Array([1])], "shot.png", { type: "image/png" });
    const jpeg = new File([new Uint8Array([2])], "a.jpg", { type: "image/jpeg" });
    const note = new File(["hi"], "a.txt", { type: "text/plain" });
    expect(fileFromClipboard({
      items: [
        { kind: "string", type: "text/plain", getAsFile: () => null },
        { kind: "file", type: "image/png", getAsFile: () => img },
      ],
    })).toBe(img);
    expect(fileFromClipboard({ files: [note, jpeg] })).toBe(jpeg);
    expect(fileFromClipboard(null)).toBeNull();
    expect(fileFromClipboard({ items: [], files: [] })).toBeNull();
    expect(fileFromClipboard({
      items: [{ kind: "file", type: "image/png", getAsFile: () => new File([], "empty.png", { type: "image/png" }) }],
    })).toBeNull();
  });
});

describe("fileToPhoto", () => {
  it("rejects a non-image file", async () => {
    vi.stubGlobal("createImageBitmap", async () => {
      throw new Error("nope");
    });
    const file = new File(["x"], "a.txt", { type: "text/plain" });
    expect((await fileToPhoto(file)).ok).toBe(false);
  });

  it("encodes a tiny jpeg", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 64, height: 64, close() {} }));
    const file = new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" });
    const got = await fileToPhoto(file);
    expect(got.ok).toBe(true);
  });

  it("converts heic when the bitmap decoder works", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 64, height: 64, close() {} }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb) {
      cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" }));
    });
    const file = new File([new Uint8Array([1, 2, 3])], "a.heic", { type: "image/heic" });
    const got = await fileToPhoto(file);
    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(got.url.startsWith("data:image/jpeg;base64,")).toBe(true);
    }
  });

  it("maps an oversized encode to too large", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 2000, height: 100, close() {} }));
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(function (cb) {
      cb(new Blob([new Uint8Array(2_000_000)], { type: "image/jpeg" }));
    });
    const file = new File([new Uint8Array([1, 2, 3])], "a.png", { type: "image/png" });
    expect(await fileToPhoto(file)).toEqual({ ok: false, error: "too large" });
  });
});
