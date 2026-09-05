import { describe, expect, it } from "vitest";
import { IMAGE_BYTES_MAX } from "@/lib/mailbox/caps";
import { parsePhotoFile, photoDataUrl, type PhotoResult } from "@/lib/phone/photo";

function photoErr(r: PhotoResult | { ok: true } | { ok: false; error: string }): string {
  return r.ok ? "ok" : r.error;
}

describe("photo", () => {
  it("accepts a small jpeg as a data URL", () => {
    const got = photoDataUrl({ mime: "image/jpg", bytes: new Uint8Array([1, 2, 3]) });
    expect(got.ok).toBe(true);
    if (got.ok) {
      expect(got.url.startsWith("data:image/jpeg;base64,")).toBe(true);
    }
  });

  it("rejects empty, huge, and non-image types", () => {
    expect(photoErr(photoDataUrl({ mime: "image/jpeg", bytes: new Uint8Array() }))).toBe("bad photo");
    expect(photoErr(photoDataUrl({ mime: "text/plain", bytes: new Uint8Array([1]) }))).toBe("bad photo");
    expect(photoErr(photoDataUrl({ mime: "image/jpeg", bytes: new Uint8Array(IMAGE_BYTES_MAX + 1) }))).toBe("too large");
    expect(parsePhotoFile({ type: "image/png", size: 10 })).toEqual({ ok: true });
    expect(parsePhotoFile({ type: "application/pdf", size: 10 }).ok).toBe(false);
    expect(parsePhotoFile({ type: "image/jpeg", size: 0 }).ok).toBe(false);
    expect(photoErr(parsePhotoFile({ type: "image/jpeg", size: IMAGE_BYTES_MAX + 1 }))).toBe("too large");
  });
});
