import { describe, expect, it } from "vitest";
import { handshake, rateId, roleFromQuery, stampUserId } from "@/lib/auth/handshake";
import { mintSession, SESSION_COOKIE } from "@/lib/auth/session";

describe("handshake", () => {
  it("accepts the spike secret for either role", async () => {
    const env = { MAILBOX_SECRET: "shared" };
    const ok = await handshake({
      env,
      slug: "kit",
      role: "phone",
      authorization: "Bearer shared",
    });
    expect(ok).toEqual({ ok: true, principal: { kind: "spike", role: "phone" } });
    const bad = await handshake({
      env,
      slug: "kit",
      role: "crane",
      querySecret: "nope",
    });
    expect(bad).toEqual({ ok: false, error: "unauthorized" });
  });

  it("in oidc, unknown sub and bad token look the same", async () => {
    const env = {
      GOOGLE_CLIENT_ID: "id",
      ALLOWED_SUBS: "1182:ada@x.com",
      SESSION_SECRET: "sess-secret",
      CRANE_BEARERS: "kit:crane-tok",
    };
    const now = Date.UTC(2026, 8, 4);
    const session = await mintSession(env.SESSION_SECRET, { sub: "1182", email: "ada@x.com" }, now);
    const phone = await handshake({
      env,
      slug: "kit",
      role: "phone",
      cookieHeader: `${SESSION_COOKIE}=${encodeURIComponent(session)}`,
      now,
    });
    expect(phone.ok && phone.principal.kind === "phone" && phone.principal.sub).toBe("1182");

    const stranger = await mintSession(env.SESSION_SECRET, { sub: "999" }, now);
    const unknown = await handshake({
      env,
      slug: "kit",
      role: "phone",
      cookieHeader: `${SESSION_COOKIE}=${encodeURIComponent(stranger)}`,
      now,
    });
    const junk = await handshake({
      env,
      slug: "kit",
      role: "phone",
      cookieHeader: `${SESSION_COOKIE}=junk`,
      now,
    });
    expect(unknown).toEqual({ ok: false, error: "unauthorized" });
    expect(junk).toEqual({ ok: false, error: "unauthorized" });
  });

  it("binds the crane bearer to the slug", async () => {
    const env = {
      GOOGLE_CLIENT_ID: "id",
      ALLOWED_SUBS: "1182",
      SESSION_SECRET: "sess-secret",
      CRANE_BEARERS: "kit:crane-tok,ada:other",
    };
    const kit = await handshake({
      env,
      slug: "kit",
      role: "crane",
      authorization: "Bearer crane-tok",
    });
    expect(kit).toEqual({ ok: true, principal: { kind: "crane", slug: "kit" } });
    const cross = await handshake({
      env,
      slug: "ada",
      role: "crane",
      authorization: "Bearer crane-tok",
    });
    expect(cross).toEqual({ ok: false, error: "unauthorized" });
  });

  it("rejects the spike secret once Google is configured", async () => {
    const env = {
      GOOGLE_CLIENT_ID: "id",
      ALLOWED_SUBS: "1182",
      SESSION_SECRET: "sess-secret",
      CRANE_BEARERS: "kit:crane-tok",
      MAILBOX_SECRET: "shared",
    };
    const spike = await handshake({
      env,
      slug: "kit",
      role: "phone",
      authorization: "Bearer shared",
    });
    expect(spike).toEqual({ ok: false, error: "unauthorized" });
  });

  it("fails config when nothing is set", async () => {
    const r = await handshake({ env: {}, slug: "kit", role: "phone" });
    expect(r).toEqual({ ok: false, error: "config" });
    expect(roleFromQuery("phone")).toBe("phone");
    expect(roleFromQuery("nope")).toBeNull();
    expect(rateId("oidc", { kind: "phone", sub: "1182" })).toBe("sub:1182");
    expect(rateId("oidc", { kind: "crane", slug: "kit" })).toBe("bearer:kit");
    expect(rateId("spike", { kind: "spike", role: "phone" })).toBe("spike:phone");
    expect(stampUserId({ kind: "phone", sub: "1182" })).toBe("1182");
    expect(stampUserId({ kind: "spike", role: "phone" })).toBe("spike");
    expect(stampUserId({ kind: "crane", slug: "kit" })).toBeUndefined();
  });
});
