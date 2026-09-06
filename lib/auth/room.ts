import { allowlistMap } from "./allowlist";
import type { RoomUser } from "../mailbox/allow";

export type RoomSession = {
  sub: string;
  email?: string;
  emailVerified?: boolean;
};

/**
 * Admit when `sub` is on the room list, or verified email matches, or
 * `sub` is on the optional static `ALLOWED_SUBS` extra. Empty list
 * admits nobody — extra is not a fallback that opens the door.
 */
export function roomAllows(
  list: readonly RoomUser[] | undefined,
  session: RoomSession,
  extraSubs?: string,
): boolean {
  if (!session.sub) {
    return false;
  }
  if (allowlistMap(extraSubs).has(session.sub)) {
    return true;
  }
  const email = session.email?.trim().toLowerCase() ?? "";
  const verified = session.emailVerified === true && Boolean(email);
  for (const row of list ?? []) {
    if (row.sub && row.sub === session.sub) {
      return true;
    }
    if (verified && row.email && row.email === email) {
      return true;
    }
  }
  return false;
}

export function phonesToClose<T extends RoomSession>(
  phones: readonly T[],
  list: readonly RoomUser[],
  extraSubs?: string,
): T[] {
  return phones.filter((phone) => !roomAllows(list, phone, extraSubs));
}
