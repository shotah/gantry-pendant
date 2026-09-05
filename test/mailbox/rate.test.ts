import { describe, expect, it } from "vitest";
import { RATE_BYTES_PER_MIN, RATE_FRAMES_PER_MIN } from "@/lib/mailbox/caps";
import { principalKey, takeFrame, takeTokens } from "@/lib/mailbox/rate";

describe("rate", () => {
  it("allows a burst then 429s", () => {
    let bucket = takeTokens(undefined, 0, 1, { rate: 2, burst: 2 });
    expect(bucket.ok).toBe(true);
    bucket = takeTokens(bucket.bucket, 0, 1, { rate: 2, burst: 2 });
    expect(bucket.ok).toBe(true);
    bucket = takeTokens(bucket.bucket, 0, 1, { rate: 2, burst: 2 });
    expect(bucket.ok).toBe(false);
  });

  it("refills over a minute", () => {
    let bucket = takeTokens(undefined, 0, 2, { rate: 2, burst: 2 });
    expect(bucket.ok).toBe(true);
    bucket = takeTokens(bucket.bucket, 60_000, 2, { rate: 2, burst: 2 });
    expect(bucket.ok).toBe(true);
  });

  it("caps frames and bytes together", () => {
    let limits = takeFrame(undefined, 0, 10);
    expect(limits.ok).toBe(true);
    for (let i = 0; i < RATE_FRAMES_PER_MIN; i++) {
      limits = takeFrame(limits.limits, 0, 1);
    }
    expect(limits.ok).toBe(false);
    const fat = takeFrame(undefined, 0, RATE_BYTES_PER_MIN + 1);
    expect(fat.ok).toBe(false);
    expect(principalKey("sub", "abc")).toBe("sub:abc");
  });
});
