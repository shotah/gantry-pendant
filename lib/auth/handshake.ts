import { allowlistMap } from "./allowlist";
import { bearerForSlug, parseBearers } from "./bearer";
import { type AuthEnv, type AuthMode, resolveAuthMode } from "./mode";
import { secretEqual } from "./secret";
import { parseCookie, readSession, SESSION_COOKIE, type SessionClaims } from "./session";
import type { Role } from "../mailbox/frame";

export type PhonePrincipal = { kind: "phone"; sub: string; email?: string; exp?: number };
export type CranePrincipal = { kind: "crane"; slug: string };
export type SpikePrincipal = { kind: "spike"; role: Role };
export type Principal = PhonePrincipal | CranePrincipal | SpikePrincipal;

export type HandshakeOk = { ok: true; principal: Principal };
export type HandshakeErr = { ok: false; error: "unauthorized" | "config" };
export type HandshakeResult = HandshakeOk | HandshakeErr;

export type HandshakeInput = {
  env: AuthEnv & { SESSION_SECRET?: string };
  slug: string;
  role: Role;
  cookieHeader?: string | null;
  authorization?: string | null;
  querySecret?: string | null;
  queryBearer?: string | null;
  now?: number;
};

function bearerFrom(
  authorization: string | null | undefined,
  query: string | null | undefined,
  allowQuery: boolean,
): string {
  const header = authorization?.trim() ?? "";
  if (header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  if (!allowQuery) {
    return "";
  }
  return query?.trim() ?? "";
}

async function phoneFromCookie(
  env: HandshakeInput["env"],
  cookieHeader: string | null | undefined,
  now: number,
): Promise<SessionClaims | null> {
  const secret = env.SESSION_SECRET?.trim() ?? "";
  const token = parseCookie(cookieHeader ?? null, SESSION_COOKIE);
  if (!secret || !token) {
    return null;
  }
  return readSession(secret, token, now);
}

/**
 * Authorize a socket. Unknown human and bad token look the same.
 * When Google is on, the spike secret is rejected.
 */
export async function handshake(input: HandshakeInput): Promise<HandshakeResult> {
  const mode = resolveAuthMode(input.env);
  if (!mode.ok) {
    return { ok: false, error: "config" };
  }
  const now = input.now ?? Date.now();
  if (mode.mode === "spike") {
    return spikeHandshake(input.env, input.role, input);
  }
  return oidcHandshake(input, now);
}

export type HandshakeSlugInput = Omit<HandshakeInput, "role">;

/** HTTP face: phone cookie or crane bearer (or the spike secret). */
export async function handshakeSlug(input: HandshakeSlugInput): Promise<HandshakeResult> {
  const mode = resolveAuthMode(input.env);
  if (!mode.ok) {
    return { ok: false, error: "config" };
  }
  const now = input.now ?? Date.now();
  if (mode.mode === "spike") {
    return spikeHandshake(input.env, "phone", { ...input, role: "phone" });
  }
  const phone = await oidcHandshake({ ...input, role: "phone" }, now);
  if (phone.ok) {
    return phone;
  }
  return oidcHandshake({ ...input, role: "crane" }, now);
}

function spikeHandshake(env: AuthEnv, role: Role, input: HandshakeInput): HandshakeResult {
  const want = env.MAILBOX_SECRET?.trim() ?? "";
  const presented = bearerFrom(input.authorization, input.querySecret, true);
  if (!want || !presented || !secretEqual(want, presented)) {
    return { ok: false, error: "unauthorized" };
  }
  return { ok: true, principal: { kind: "spike", role } };
}

async function oidcHandshake(input: HandshakeInput, now: number): Promise<HandshakeResult> {
  if (input.role === "phone") {
    const session = await phoneFromCookie(input.env, input.cookieHeader, now);
    const allowed = allowlistMap(input.env.ALLOWED_SUBS);
    if (!session || !allowed.has(session.sub)) {
      return { ok: false, error: "unauthorized" };
    }
    return { ok: true, principal: { kind: "phone", sub: session.sub, email: session.email, exp: session.exp } };
  }
  const presented = bearerFrom(input.authorization, input.queryBearer, false);
  const bearers = parseBearers(input.env.CRANE_BEARERS);
  if (!presented || !bearerForSlug(bearers, input.slug, presented)) {
    return { ok: false, error: "unauthorized" };
  }
  return { ok: true, principal: { kind: "crane", slug: input.slug } };
}

export function roleFromQuery(raw: string | null): Role | null {
  if (raw === "phone" || raw === "crane") {
    return raw;
  }
  return null;
}

export function rateId(mode: AuthMode, principal: Principal): string {
  if (principal.kind === "phone") {
    return `sub:${principal.sub}`;
  }
  if (principal.kind === "crane") {
    return `bearer:${principal.slug}`;
  }
  return `spike:${principal.role}`;
}

export function stampUserId(principal: Principal): string | undefined {
  if (principal.kind === "phone") {
    return principal.sub;
  }
  if (principal.kind === "spike" && principal.role === "phone") {
    return "spike";
  }
  return undefined;
}
