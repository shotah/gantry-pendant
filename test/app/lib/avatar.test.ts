import { afterEach, describe, expect, it, vi } from "vitest";
import { uploadAvatarFile } from "@/app/lib/avatar";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function jpegFile(): File {
  const bytes = new Uint8Array(64);
  bytes[0] = 0xff;
  bytes[1] = 0xd8;
  bytes[2] = 0xff;
  return new File([bytes], "a.jpg", { type: "image/jpeg" });
}

describe("uploadAvatarFile", () => {
  it("posts multipart avatar.jpg and returns the rev", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 64, height: 64, close() {} }));
    vi.stubGlobal("fetch", async (input: RequestInfo, init?: RequestInit) => {
      expect(String(input)).toContain("/api/avatar?slug=kit");
      expect(init?.method).toBe("POST");
      expect(init?.body).toBeInstanceOf(FormData);
      return Response.json({ ok: true, rev: 9, detail: "saved avatar.jpg" });
    });
    const got = await uploadAvatarFile({ slug: "kit", file: jpegFile() });
    expect(got).toEqual({ ok: true, rev: 9 });
  });

  it("surfaces a Worker error", async () => {
    vi.stubGlobal("createImageBitmap", async () => ({ width: 64, height: 64, close() {} }));
    vi.stubGlobal("fetch", async () => Response.json({ error: "need a JPEG" }, { status: 400 }));
    const got = await uploadAvatarFile({ slug: "kit", file: jpegFile() });
    expect(got).toEqual({ ok: false, error: "need a JPEG" });
  });

  it("maps convert and network failures", async () => {
    vi.stubGlobal("createImageBitmap", async () => {
      throw new Error("nope");
    });
    expect((await uploadAvatarFile({ slug: "kit", file: jpegFile() })).ok).toBe(false);

    vi.stubGlobal("createImageBitmap", async () => ({ width: 8, height: 8, close() {} }));
    const tiny = new File([new Uint8Array([0xff, 0xd8, 0xff])], "a.jpg", { type: "image/jpeg" });
    expect((await uploadAvatarFile({ slug: "kit", file: tiny })).ok).toBe(false);

    vi.stubGlobal("createImageBitmap", async () => ({ width: 64, height: 64, close() {} }));
    vi.stubGlobal("fetch", async () => {
      throw new Error("net");
    });
    expect((await uploadAvatarFile({ slug: "kit", file: jpegFile() })).ok).toBe(false);
  });
});
