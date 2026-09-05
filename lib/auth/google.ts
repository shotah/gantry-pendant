import { createRemoteJWKSet, jwtVerify } from "jose";
import { randomBytes } from "node:crypto";

export const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";

const SCOPES = "openid email profile";

export type GoogleIdentity = { sub: string; email?: string };

export function callbackUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/auth/callback/google`;
}

export function authorizeUrl(opts: { clientId: string; origin: string; state: string }): string {
  const u = new URL(GOOGLE_AUTH);
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", callbackUrl(opts.origin));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES);
  u.searchParams.set("state", opts.state);
  u.searchParams.set("access_type", "online");
  return u.toString();
}

export function newState(): string {
  return randomBytes(24).toString("base64url");
}

export type ExchangeFn = (url: string, init: RequestInit) => Promise<Response>;

export async function exchangeCode(
  opts: {
    code: string;
    clientId: string;
    clientSecret: string;
    origin: string;
    fetch?: ExchangeFn;
  },
): Promise<{ idToken: string } | { error: string }> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: callbackUrl(opts.origin),
    grant_type: "authorization_code",
  });
  const fetchFn = opts.fetch ?? fetch;
  const res = await fetchFn(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    return { error: "unauthorized" };
  }
  const json = (await res.json()) as { id_token?: unknown };
  if (typeof json.id_token !== "string" || !json.id_token) {
    return { error: "unauthorized" };
  }
  return { idToken: json.id_token };
}

export type VerifyFn = (token: string, clientId: string) => Promise<GoogleIdentity | null>;

const jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS));

export async function verifyIdToken(token: string, clientId: string): Promise<GoogleIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    if (typeof payload.sub !== "string" || !payload.sub) {
      return null;
    }
    const email = typeof payload.email === "string" ? payload.email : undefined;
    return { sub: payload.sub, email };
  } catch {
    return null;
  }
}

/** Same error whether the sub is unknown or the token is junk. */
export function acceptHuman(
  identity: GoogleIdentity | null,
  allowed: Map<string, string>,
): GoogleIdentity | null {
  if (!identity || !allowed.has(identity.sub)) {
    return null;
  }
  const label = allowed.get(identity.sub);
  return { sub: identity.sub, email: identity.email ?? (label || undefined) };
}
