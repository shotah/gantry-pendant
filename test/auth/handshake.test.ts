import { describe, expect, it } from "vitest";
import { handshake, handshakeSlug, rateId, roleFromQuery, stampEmail, stampUserId } from "@/lib/auth/handshake";
import { mintSession, readSession, SESSION_COOKIE } from "@/lib/auth/session";

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
    const claims = await readSession(env.SESSION_SECRET, session, now);
    const phone = await handshake({
      env,
      slug: "kit",
      role: "phone",
      cookieHeader: `${SESSION_COOKIE}=${encodeURIComponent(session)}`,
      now,
    });
    expect(phone).toEqual({
      ok: true,
      principal: {
        kind: "phone",
        sub: "1182",
        email: "ada@x.com",
        emailVerified: false,
        exp: claims?.exp,
      },
    });

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

  it("in oidc, query bearer is ignored so the crane must send Authorization", async () => {
    const env = {
      GOOGLE_CLIENT_ID: "id",
      ALLOWED_SUBS: "1182",
      SESSION_SECRET: "sess-secret",
      CRANE_BEARERS: "kit:crane-tok",
    };
    const queryOnly = await handshake({
      env,
      slug: "kit",
      role: "crane",
      queryBearer: "crane-tok",
    });
    expect(queryOnly).toEqual({ ok: false, error: "unauthorized" });
    const header = await handshake({
      env,
      slug: "kit",
      role: "crane",
      authorization: "Bearer crane-tok",
      queryBearer: "ignored",
    });
    expect(header).toEqual({ ok: true, principal: { kind: "crane", slug: "kit" } });
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
    expect(rateId("oidc", { kind: "phone", sub: "1182", exp: 1 })).toBe("sub:1182");
    expect(rateId("oidc", { kind: "crane", slug: "kit" })).toBe("bearer:kit");
    expect(rateId("spike", { kind: "spike", role: "phone" })).toBe("spike:phone");
    expect(stampUserId({ kind: "phone", sub: "1182" })).toBe("1182");
    expect(stampEmail({ kind: "phone", sub: "1182", email: "ada@x.com" })).toBe("ada@x.com");
    expect(stampEmail({ kind: "phone", sub: "1182" })).toBeUndefined();
    expect(stampUserId({ kind: "spike", role: "phone" })).toBe("spike");
    expect(stampUserId({ kind: "crane", slug: "kit" })).toBeUndefined();
  });
});

describe("handshakeSlug", () => {
  it("accepts the spike secret without a role", async () => {
    const env = { MAILBOX_SECRET: "shared" };
    const ok = await handshakeSlug({ env, slug: "kit", querySecret: "shared" });
    expect(ok.ok && ok.principal.kind).toBe("spike");
    const bad = await handshakeSlug({ env, slug: "kit", querySecret: "nope" });
    expect(bad).toEqual({ ok: false, error: "unauthorized" });
  });

  it("accepts a phone cookie or a crane bearer", async () => {
    const env = {
      GOOGLE_CLIENT_ID: "id",
      ALLOWED_SUBS: "1182:ada@x.com",
      SESSION_SECRET: "sess-secret",
      CRANE_BEARERS: "kit:crane-tok",
    };
    const now = Date.UTC(2026, 8, 4);
    const session = await mintSession(env.SESSION_SECRET, { sub: "1182", email: "ada@x.com" }, now);
    const phone = await handshakeSlug({
      env,
      slug: "kit",
      cookieHeader: `${SESSION_COOKIE}=${encodeURIComponent(session)}`,
      now,
    });
    expect(phone.ok && phone.principal.kind === "phone" && phone.principal.sub).toBe("1182");
    expect(phone.ok && phone.principal.kind === "phone" && phone.principal.exp).toBeDefined();
    const crane = await handshakeSlug({
      env,
      slug: "kit",
      authorization: "Bearer crane-tok",
      now,
    });
    expect(crane).toEqual({ ok: true, principal: { kind: "crane", slug: "kit" } });
    const queryCrane = await handshakeSlug({
      env,
      slug: "kit",
      queryBearer: "crane-tok",
      now,
    });
    expect(queryCrane).toEqual({ ok: false, error: "unauthorized" });
  });
});

describe("handshake room list", () => {
  const env = {
    GOOGLE_CLIENT_ID: "id",
    SESSION_SECRET: "sess-secret",
    CRANE_BEARERS: "kit:crane-tok",
  };
  const now = Date.UTC(2026, 8, 4);
  const ada = "118212345678901234567";

  async function cookie(human: { sub: string; email?: string; emailVerified?: boolean }) {
    const token = await mintSession(env.SESSION_SECRET, human, now);
    return `${SESSION_COOKIE}=${encodeURIComponent(token)}`;
  }

  it("admits by room sub without ALLOWED_SUBS", async () => {
    const ok = await handshake({
      env,
      slug: "kit",
      role: "phone",
      cookieHeader: await cookie({ sub: ada, email: "ada@example.com", emailVerified: true }),
      roomList: [{ sub: ada, email: "ada@example.com" }],
      now,
    });
    expect(ok.ok && ok.principal.kind === "phone" && ok.principal.sub).toBe(ada);
  });

  it("admits by verified email on the room list", async () => {
    const ok = await handshake({
      env,
      slug: "kit",
      role: "phone",
      cookieHeader: await cookie({ sub: ada, email: "ada@example.com", emailVerified: true }),
      roomList: [{ email: "ada@example.com" }],
      now,
    });
    expect(ok.ok && ok.principal.kind === "phone" && ok.principal.sub).toBe(ada);
  });

  it("refuses an unverified email even when the address is listed", async () => {
    const refused = await handshake({
      env,
      slug: "kit",
      role: "phone",
      cookieHeader: await cookie({ sub: ada, email: "ada@example.com", emailVerified: false }),
      roomList: [{ email: "ada@example.com" }],
      now,
    });
    expect(refused).toEqual({ ok: false, error: "unauthorized" });
  });

  it("still admits a static ALLOWED_SUBS extra", async () => {
    const ok = await handshake({
      env: { ...env, ALLOWED_SUBS: ada },
      slug: "kit",
      role: "phone",
      cookieHeader: await cookie({ sub: ada }),
      roomList: [],
      now,
    });
    expect(ok.ok && ok.principal.kind === "phone" && ok.principal.sub).toBe(ada);
  });

  it("fails closed with a valid session and no room list", async () => {
    const refused = await handshake({
      env,
      slug: "kit",
      role: "phone",
      cookieHeader: await cookie({ sub: ada, email: "ada@example.com", emailVerified: true }),
      now,
    });
    expect(refused).toEqual({ ok: false, error: "unauthorized" });
  });

  it("binds the crane bearer without ALLOWED_SUBS", async () => {
    const kit = await handshake({
      env,
      slug: "kit",
      role: "crane",
      authorization: "Bearer crane-tok",
    });
    expect(kit).toEqual({ ok: true, principal: { kind: "crane", slug: "kit" } });
  });
});
