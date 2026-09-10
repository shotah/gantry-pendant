import { EncryptJWT, jwtDecrypt, type JWTPayload } from "jose";
import { sessionKeyBytes } from "./secret";

export const SESSION_COOKIE = "pendant_session";
export const STATE_COOKIE = "pendant_oauth_state";

export type SessionClaims = {
  sub: string;
  email?: string;
  emailVerified?: boolean;
  iat: number;
  exp: number;
};

/** Hard 7d JWT `exp` at mint. There is no sliding idle (that is R5). */
const IDLE_MS = 7 * 24 * 60 * 60 * 1000;
/** Unreachable defense while live policy is hard 7d; keep for a future sliding refresh. */
const ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000;

function key(secret: string): Uint8Array {
  return sessionKeyBytes(secret);
}

export async function mintSession(
  secret: string,
  human: { sub: string; email?: string; emailVerified?: boolean },
  now = Date.now(),
): Promise<string> {
  const email = human.email?.trim().toLowerCase() ?? "";
  const jwt = new EncryptJWT({
    sub: human.sub,
    email,
    email_verified: human.emailVerified === true,
    nbf_abs: Math.floor(now / 1000),
  })
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt(Math.floor(now / 1000))
    .setExpirationTime(Math.floor((now + IDLE_MS) / 1000));
  return jwt.encrypt(key(secret));
}

export async function readSession(
  secret: string,
  token: string,
  now = Date.now(),
): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtDecrypt(token, key(secret));
    return claimsFrom(payload, now);
  } catch {
    return null;
  }
}

function claimsFrom(payload: JWTPayload, now: number): SessionClaims | null {
  const sub = typeof payload.sub === "string" ? payload.sub : "";
  if (!sub) {
    return null;
  }
  const iat = typeof payload.iat === "number" ? payload.iat * 1000 : 0;
  const exp = typeof payload.exp === "number" ? payload.exp * 1000 : 0;
  // Live policy is hard 7d (`exp`). ABSOLUTE_MS is unreachable defense.
  if (!iat || !exp || now > exp || now - iat > ABSOLUTE_MS) {
    return null;
  }
  const email = typeof payload.email === "string" && payload.email
    ? payload.email.trim().toLowerCase()
    : undefined;
  const emailVerified = payload.email_verified === true;
  return { sub, email, emailVerified, iat, exp };
}

export function parseCookie(header: string | null, name: string): string | undefined {
  if (!header) {
    return undefined;
  }
  for (const part of header.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) {
      return decodeURIComponent(rest.join("="));
    }
  }
  return undefined;
}

/** `Authorization: Bearer <token>` — empty / missing / wrong scheme → undefined. */
export function bearerToken(authorization: string | null | undefined): string | undefined {
  const header = authorization?.trim() ?? "";
  const prefix = "bearer ";
  if (header.length < prefix.length || header.slice(0, prefix.length).toLowerCase() !== prefix) {
    return undefined;
  }
  const token = header.slice(prefix.length).trim();
  return token || undefined;
}

/**
 * PWA sends the httpOnly cookie. Native cab sends the same JWE on
 * `Authorization`. Cookie wins when both are present.
 */
export async function readSessionFromRequest(
  secret: string,
  opts: { cookieHeader?: string | null; authorization?: string | null },
  now = Date.now(),
): Promise<SessionClaims | null> {
  const fromCookie = parseCookie(opts.cookieHeader ?? null, SESSION_COOKIE);
  if (fromCookie) {
    const claims = await readSession(secret, fromCookie, now);
    if (claims) {
      return claims;
    }
  }
  const fromAuth = bearerToken(opts.authorization);
  if (!fromAuth) {
    return null;
  }
  return readSession(secret, fromAuth, now);
}

export function sessionCookie(value: string, secure: boolean, maxAgeSec = IDLE_MS / 1000): string {
  const bits = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAgeSec)}`,
  ];
  if (secure) {
    bits.push("Secure");
  }
  return bits.join("; ");
}

export function clearCookie(name: string, secure: boolean): string {
  const bits = [`${name}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (secure) {
    bits.push("Secure");
  }
  return bits.join("; ");
}

export function stateCookie(value: string, secure: boolean): string {
  const bits = [
    `${STATE_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=600",
  ];
  if (secure) {
    bits.push("Secure");
  }
  return bits.join("; ");
}
