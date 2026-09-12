import { afterEach, describe, expect, it } from "vitest";
import {
  consumeNativeNonce,
  encodeNativeNonceRow,
  issueNativeNonce,
  memoryNativeNonceStore,
  nativeNonceAccepted,
  nativeNonceKey,
  nativeNonceStore,
  NATIVE_NONCE_TTL_MS,
  nonceTtlSec,
  parseNativeNonceRow,
  putIssuedNonce,
  resetNativeNonces,
  takeNativeNonceRow,
} from "@/lib/auth/nonce";

afterEach(() => {
  resetNativeNonces();
});

describe("native nonce", () => {
  it("issues a 5-minute nonce and consumes it once", async () => {
    const now = Date.UTC(2026, 8, 12);
    const issued = issueNativeNonce(now);
    expect(issued.exp).toBe(now + NATIVE_NONCE_TTL_MS);
    expect(issued.nonce.length).toBeGreaterThan(8);
    const store = memoryNativeNonceStore();
    await putIssuedNonce(store, issued, now);
    expect(await consumeNativeNonce(store, issued.nonce, now + 1_000)).toBe("ok");
    expect(await consumeNativeNonce(store, issued.nonce, now + 2_000)).toBe("replay");
  });

  it("treats an unknown nonce as a legacy Cab mint, and expired as a deny", () => {
    expect(takeNativeNonceRow(null, 1)).toBe("missing");
    expect(nativeNonceAccepted("missing")).toBe(true);
    expect(nativeNonceAccepted("ok")).toBe(true);
    expect(nativeNonceAccepted("replay")).toBe(false);
    expect(nativeNonceAccepted("expired")).toBe(false);
    expect(takeNativeNonceRow({ exp: 10, used: false }, 10)).toBe("expired");
    expect(takeNativeNonceRow({ exp: 10, used: true }, 1)).toBe("replay");
    expect(parseNativeNonceRow(encodeNativeNonceRow({ exp: 9, used: false }))).toEqual({
      exp: 9,
      used: false,
    });
    expect(parseNativeNonceRow("nope")).toBeNull();
    expect(nativeNonceKey("abc").startsWith("nn:")).toBe(true);
  });

  it("does not consume a missing nonce row", async () => {
    const store = memoryNativeNonceStore();
    expect(await consumeNativeNonce(store, "local-mint", 1_000)).toBe("missing");
  });

  it("writes DIRECTORY with remaining TTL", async () => {
    const puts: { key: string; ttl: number }[] = [];
    const store = nativeNonceStore({
      get: async () => null,
      put: async (key, _value, opts) => {
        puts.push({ key, ttl: opts?.expirationTtl ?? 0 });
      },
    });
    const now = Date.UTC(2026, 8, 12);
    const issued = { nonce: "abc", exp: now + NATIVE_NONCE_TTL_MS };
    await putIssuedNonce(store, issued, now);
    expect(puts).toEqual([{ key: nativeNonceKey("abc"), ttl: nonceTtlSec(issued.exp, now) }]);
    expect(nonceTtlSec(now + 1_000, now)).toBe(60);
  });
});
