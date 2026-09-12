import { describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/auth/config/route";
import { PACKAGE_VERSION } from "@/app/lib/release";

vi.mock("cloudflare:workers", () => ({
  env: {
    GOOGLE_CLIENT_ID: "web.apps.googleusercontent.com",
    SESSION_SECRET: "sess",
    CRANE_BEARERS: "kit:tok",
  },
}));

describe("auth config route", () => {
  it("echoes package.json version as additive JSON", async () => {
    const res = GET(new Request("https://pendant.example/api/auth/config"));
    expect(res.status).toBe(200);
    const body = await res.json() as { mode: string; google: boolean; version: string; dev: boolean };
    expect(body).toMatchObject({
      mode: "oidc",
      google: true,
      version: PACKAGE_VERSION,
      dev: false,
    });
    expect(body.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
