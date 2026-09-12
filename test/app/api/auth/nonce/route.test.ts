import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/auth/nonce/route";
import { resetAuthLimits } from "@/lib/auth/limit";
import { nativeNonceKey, nativeNonceMemory, parseNativeNonceRow, resetNativeNonces } from "@/lib/auth/nonce";

vi.mock("cloudflare:workers", () => ({
  env: {
    GOOGLE_CLIENT_ID: "web.apps.googleusercontent.com",
    SESSION_SECRET: "sess",
    CRANE_BEARERS: "kit:tok",
  },
}));

afterEach(() => {
  resetAuthLimits();
  resetNativeNonces();
});

describe("native nonce route", () => {
  it("returns a nonce Cab can put on Google Sign-In", async () => {
    const res = await GET(new Request("https://pendant.example/api/auth/nonce"));
    expect(res.status).toBe(200);
    const body = await res.json() as { nonce: string; exp: number };
    expect(body.nonce.length).toBeGreaterThan(8);
    expect(body.exp).toBeGreaterThan(Date.now());
    expect(parseNativeNonceRow(nativeNonceMemory.get(nativeNonceKey(body.nonce)))).toMatchObject({
      used: false,
    });
  });
});
