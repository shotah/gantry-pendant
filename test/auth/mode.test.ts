import { describe, expect, it } from "vitest";
import { publicAuthConfig, resolveAuthMode } from "@/lib/auth/mode";

describe("auth mode", () => {
  it("uses the shared secret for the two-tab spike", () => {
    expect(resolveAuthMode({ MAILBOX_SECRET: "s" })).toEqual({ ok: true, mode: "spike" });
    expect(publicAuthConfig({ MAILBOX_SECRET: "s" })).toEqual({ mode: "spike", google: false });
  });

  it("requires session and crane bearers when Google is on", () => {
    expect(resolveAuthMode({ GOOGLE_CLIENT_ID: "id" }).ok).toBe(false);
    expect(resolveAuthMode({
      GOOGLE_CLIENT_ID: "id",
      SESSION_SECRET: "sess",
    }).ok).toBe(false);
    expect(resolveAuthMode({
      GOOGLE_CLIENT_ID: "id",
      SESSION_SECRET: "sess",
      CRANE_BEARERS: "kit:tok",
      MAILBOX_SECRET: "ignored",
    })).toEqual({ ok: true, mode: "oidc" });
    expect(resolveAuthMode({
      GOOGLE_CLIENT_ID: "id",
      SESSION_SECRET: "sess",
      CRANE_BEARERS: "kit:tok",
      ALLOWED_SUBS: "sub1",
    })).toEqual({ ok: true, mode: "oidc" });
  });

  it("fails closed with no credentials", () => {
    expect(resolveAuthMode({}).ok).toBe(false);
    expect(publicAuthConfig({ GOOGLE_CLIENT_ID: "id" }).google).toBe(true);
  });
});
