import { describe, expect, it } from "vitest";
import { fileToPhoto } from "@/app/lib/photo";

describe("fileToPhoto", () => {
  it("rejects a non-image file", async () => {
    const file = new File(["x"], "a.txt", { type: "text/plain" });
    expect((await fileToPhoto(file)).ok).toBe(false);
  });

  it("encodes a tiny jpeg", async () => {
    const file = new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" });
    const got = await fileToPhoto(file);
    expect(got.ok).toBe(true);
  });
});
