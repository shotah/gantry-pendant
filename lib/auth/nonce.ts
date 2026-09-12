import { newNonce } from "./google";

/** Cab GETs this, puts it on Google Sign-In, POSTs it on `/api/auth/token`. */
export const NATIVE_NONCE_TTL_MS = 5 * 60 * 1000;
export const NATIVE_NONCE_PREFIX = "nn:";

export type NativeNonceRow = { exp: number; used: boolean };

export type NativeNonceTake = "ok" | "missing" | "replay" | "expired";

/** `ok` = server-issued and consumed. `missing` = old Cab that minted locally. */
export function nativeNonceAccepted(take: NativeNonceTake): boolean {
  return take === "ok" || take === "missing";
}

export function nativeNonceKey(nonce: string): string {
  return `${NATIVE_NONCE_PREFIX}${nonce}`;
}

export function issueNativeNonce(now = Date.now()): { nonce: string; exp: number } {
  return { nonce: newNonce(), exp: now + NATIVE_NONCE_TTL_MS };
}

export function parseNativeNonceRow(raw: string | null | undefined): NativeNonceRow | null {
  if (!raw) {
    return null;
  }
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== "object") {
      return null;
    }
    const rec = v as Record<string, unknown>;
    const exp = rec.exp;
    if (typeof exp !== "number" || !Number.isFinite(exp) || exp <= 0) {
      return null;
    }
    return { exp, used: rec.used === true };
  } catch {
    return null;
  }
}

export function takeNativeNonceRow(row: NativeNonceRow | null, now: number): NativeNonceTake {
  if (!row) {
    return "missing";
  }
  if (row.used) {
    return "replay";
  }
  if (now >= row.exp) {
    return "expired";
  }
  return "ok";
}

export function encodeNativeNonceRow(row: NativeNonceRow): string {
  return JSON.stringify(row);
}

export function nonceTtlSec(exp: number, now: number): number {
  return Math.max(60, Math.ceil((exp - now) / 1000));
}

export type NativeNonceStore = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSec: number): Promise<void>;
};

export const nativeNonceMemory = new Map<string, string>();

export function resetNativeNonces(): void {
  nativeNonceMemory.clear();
}

export function memoryNativeNonceStore(map = nativeNonceMemory): NativeNonceStore {
  return {
    get: async (key) => map.get(key) ?? null,
    put: async (key, value) => {
      map.set(key, value);
    },
  };
}

export async function putIssuedNonce(
  store: NativeNonceStore,
  issued: { nonce: string; exp: number },
  now = Date.now(),
): Promise<void> {
  await store.put(
    nativeNonceKey(issued.nonce),
    encodeNativeNonceRow({ exp: issued.exp, used: false }),
    nonceTtlSec(issued.exp, now),
  );
}

export async function consumeNativeNonce(
  store: NativeNonceStore,
  nonce: string,
  now = Date.now(),
): Promise<NativeNonceTake> {
  const key = nativeNonceKey(nonce);
  const row = parseNativeNonceRow(await store.get(key));
  const take = takeNativeNonceRow(row, now);
  if (take !== "ok" || !row) {
    return take;
  }
  await store.put(key, encodeNativeNonceRow({ exp: row.exp, used: true }), nonceTtlSec(row.exp, now));
  return "ok";
}

/** DIRECTORY when bound; otherwise an isolate map (loopback / unit tests). */
export function nativeNonceStore(kv?: {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl: number }): Promise<void>;
} | null): NativeNonceStore {
  if (!kv) {
    return memoryNativeNonceStore();
  }
  return {
    get: (key) => kv.get(key),
    put: (key, value, ttlSec) => kv.put(key, value, { expirationTtl: ttlSec }),
  };
}
