import { takeTokens, type Bucket } from "../mailbox/rate";

/** Cheap login /me buckets. Same 429 body for every miss. */
export const AUTH_RATE_PER_MIN = 20;

export const authLimitStore = new Map<string, Bucket>();

export function resetAuthLimits(): void {
  authLimitStore.clear();
}

export function takeAuthAttempt(key: string, now = Date.now()): boolean {
  const got = takeTokens(authLimitStore.get(key), now, 1, {
    rate: AUTH_RATE_PER_MIN,
    burst: AUTH_RATE_PER_MIN,
  });
  authLimitStore.set(key, got.bucket);
  return got.ok;
}

export function clientIp(req: Request): string {
  const cf = req.headers.get("CF-Connecting-IP")?.trim();
  if (cf) {
    return cf;
  }
  const xff = req.headers.get("X-Forwarded-For")?.split(",")[0]?.trim();
  if (xff) {
    return xff;
  }
  return "unknown";
}

export function limitAuthIp(req: Request, now = Date.now()): boolean {
  return takeAuthAttempt(`ip:${clientIp(req)}`, now);
}

export function limitAuthSub(sub: string, now = Date.now()): boolean {
  return takeAuthAttempt(`sub:${sub}`, now);
}

export function limitAuthRequest(req: Request, sub?: string, now = Date.now()): boolean {
  if (!limitAuthIp(req, now)) {
    return false;
  }
  if (sub && !limitAuthSub(sub, now)) {
    return false;
  }
  return true;
}
