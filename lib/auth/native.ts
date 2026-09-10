import { verifyIdToken } from "./google";
import { mintSession, readSession } from "./session";

export type NativeTokenBody = { idToken: string; nonce: string };

export type NativeSession = {
  token: string;
  sub: string;
  email?: string;
  exp: number;
};

/** Cab POSTs `{ id_token, nonce }`. Same deny for junk JSON and missing fields. */
export function parseNativeTokenBody(raw: unknown): NativeTokenBody | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const rec = raw as Record<string, unknown>;
  const idToken = rec.id_token;
  const nonce = rec.nonce;
  if (typeof idToken !== "string" || !idToken) {
    return null;
  }
  if (typeof nonce !== "string" || !nonce) {
    return null;
  }
  return { idToken, nonce };
}

export type MintNativeOpts = {
  idToken: string;
  nonce: string;
  clientId: string;
  sessionSecret: string;
  now?: number;
  verify?: typeof verifyIdToken;
};

/** Google ID token → same 7d JWE the PWA cookie holds. Cab stores the JWE. */
export async function mintNativeSession(opts: MintNativeOpts): Promise<NativeSession | null> {
  const clientId = opts.clientId.trim();
  const sessionSecret = opts.sessionSecret.trim();
  if (!clientId || !sessionSecret) {
    return null;
  }
  const verify = opts.verify ?? verifyIdToken;
  const identity = await verify(opts.idToken, clientId, opts.nonce);
  if (!identity) {
    return null;
  }
  const now = opts.now ?? Date.now();
  const token = await mintSession(sessionSecret, identity, now);
  const claims = await readSession(sessionSecret, token, now);
  if (!claims) {
    return null;
  }
  return {
    token,
    sub: claims.sub,
    email: claims.email,
    exp: claims.exp,
  };
}
