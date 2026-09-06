import { allowlistMap } from "../auth/allowlist";
import type { Role } from "./frame";

/** Decimal millisecond expiry from `X-Pendant-Exp`. Absent / junk → skip the exp check. */
export function parseExpMs(raw: string | undefined): number | undefined {
  if (!raw || !/^[0-9]+$/.test(raw)) {
    return undefined;
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    return undefined;
  }
  return n;
}

export type SocketAuthInput = {
  role: Role;
  userId?: string;
  expMs?: number;
  allowedSubs?: string;
  now: number;
};

/**
 * Phone sockets re-check allowlist + exp when `ALLOWED_SUBS` is non-empty.
 * Spike (empty list) and crane skip. Does not log sub.
 */
export function socketMessageAllowed(input: SocketAuthInput): boolean {
  if (input.role !== "phone") {
    return true;
  }
  const allowed = allowlistMap(input.allowedSubs);
  if (allowed.size === 0) {
    return true;
  }
  if (!input.userId || !allowed.has(input.userId)) {
    return false;
  }
  if (input.expMs != null && input.expMs > 0 && input.now > input.expMs) {
    return false;
  }
  return true;
}
