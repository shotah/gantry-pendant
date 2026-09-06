import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import { createHash, randomBytes } from "node:crypto";

export const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
export const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";

const SCOPES = "openid email profile";

export type GoogleIdentity = { sub: string; email?: string; emailVerified: boolean };

export type Pkce = { verifier: string; challenge: string };

export type OAuthBind = { state: string; verifier: string; nonce: string };

export function callbackUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/auth/callback/google`;
}

export function authorizeUrl(opts: {
  clientId: string;
  origin: string;
  state: string;
  codeChallenge: string;
  nonce: string;
}): string {
  const u = new URL(GOOGLE_AUTH);
  u.searchParams.set("client_id", opts.clientId);
  u.searchParams.set("redirect_uri", callbackUrl(opts.origin));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES);
  u.searchParams.set("state", opts.state);
  u.searchParams.set("code_challenge", opts.codeChallenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("nonce", opts.nonce);
  u.searchParams.set("access_type", "online");
  return u.toString();
}

export function newState(): string {
  return randomBytes(24).toString("base64url");
}

export function newNonce(): string {
  return randomBytes(24).toString("base64url");
}

export function newPkce(): Pkce {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function encodeOAuthBind(bind: OAuthBind): string {
  return JSON.stringify(bind);
}

export function decodeOAuthBind(raw: string | undefined): OAuthBind | null {
  if (!raw) {
    return null;
  }
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object") {
      return null;
    }
    const rec = v as Record<string, unknown>;
    const state = rec.state;
    const verifier = rec.verifier;
    const nonce = rec.nonce;
    if (typeof state !== "string" || !state) {
      return null;
    }
    if (typeof verifier !== "string" || !verifier) {
      return null;
    }
    if (typeof nonce !== "string" || !nonce) {
      return null;
    }
    return { state, verifier, nonce };
  } catch {
    return null;
  }
}

export type ExchangeFn = (url: string, init: RequestInit) => Promise<Response>;

export async function exchangeCode(
  opts: {
    code: string;
    clientId: string;
    clientSecret: string;
    origin: string;
    codeVerifier: string;
    fetch?: ExchangeFn;
  },
): Promise<{ idToken: string } | { error: string }> {
  const body = new URLSearchParams({
    code: opts.code,
    client_id: opts.clientId,
    client_secret: opts.clientSecret,
    redirect_uri: callbackUrl(opts.origin),
    grant_type: "authorization_code",
    code_verifier: opts.codeVerifier,
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

export type VerifyFn = (token: string, clientId: string, nonce: string) => Promise<GoogleIdentity | null>;

const jwks = createRemoteJWKSet(new URL(GOOGLE_JWKS));

export function identityFromIdTokenPayload(payload: JWTPayload, nonce: string): GoogleIdentity | null {
  if (!nonce || typeof payload.nonce !== "string" || payload.nonce !== nonce) {
    return null;
  }
  if (typeof payload.sub !== "string" || !payload.sub) {
    return null;
  }
  const email = typeof payload.email === "string" && payload.email
    ? payload.email.trim().toLowerCase()
    : undefined;
  return { sub: payload.sub, email, emailVerified: payload.email_verified === true };
}

export async function verifyIdToken(
  token: string,
  clientId: string,
  nonce: string,
): Promise<GoogleIdentity | null> {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: clientId,
    });
    return identityFromIdTokenPayload(payload, nonce);
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
  return {
    sub: identity.sub,
    email: identity.email ?? (label || undefined),
    emailVerified: identity.emailVerified,
  };
}
