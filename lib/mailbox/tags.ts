import type { Role } from "./frame";
import { parseEmailVerified, parseExpMs } from "./socketAuth";

export const ROLE_PHONE = "role:phone";
export const ROLE_CRANE = "role:crane";
export const WS_OPEN = 1;

export type SocketMeta = {
  role: Role;
  rateId: string;
  userId?: string;
  expMs?: number;
  email?: string;
  emailVerified?: boolean;
};

export function roleTag(role: Role): string {
  return role === "crane" ? ROLE_CRANE : ROLE_PHONE;
}

export function subTag(userId: string): string {
  return `sub:${userId}`;
}

/** Tags that `getWebSockets` may match after a deploy (prefixed + leftover positional). */
export function tagAliases(tag: string): string[] {
  if (tag === ROLE_PHONE) {
    return [ROLE_PHONE, "phone"];
  }
  if (tag === ROLE_CRANE) {
    return [ROLE_CRANE, "crane"];
  }
  if (tag.startsWith("sub:") && tag.length > 4) {
    return [tag, tag.slice(4)];
  }
  return [tag];
}

export function collectTagged<T>(get: (tag: string) => readonly T[], tag: string): T[] {
  const out: T[] = [];
  const seen = new Set<T>();
  for (const name of tagAliases(tag)) {
    for (const ws of get(name)) {
      if (!seen.has(ws)) {
        seen.add(ws);
        out.push(ws);
      }
    }
  }
  return out;
}

export function isSocketOpen(ws: { readyState: number }): boolean {
  return ws.readyState === WS_OPEN;
}

export function openSockets<T extends { readyState: number }>(sockets: readonly T[]): T[] {
  return sockets.filter(isSocketOpen);
}

/** Queue inbound for the crane only when no live crane socket is open. */
export function queueForCrane(openPeerCount: number): boolean {
  return openPeerCount < 1;
}

export function socketTags(meta: SocketMeta): string[] {
  const tags = [roleTag(meta.role), `rate:${meta.rateId || "anon"}`];
  if (meta.userId) {
    tags.push(subTag(meta.userId));
  }
  if (meta.expMs != null && meta.expMs > 0) {
    tags.push(`exp:${meta.expMs}`);
  }
  if (meta.email) {
    tags.push(`email:${meta.email}`);
  }
  if (meta.emailVerified) {
    tags.push("verified:1");
  }
  return tags;
}

function prefixed(tags: readonly string[]): boolean {
  return tags.some((t) => (
    t.startsWith("role:") || t.startsWith("rate:") || t.startsWith("sub:")
  ));
}

export function parseSocketTags(tags: readonly string[]): SocketMeta {
  if (!prefixed(tags)) {
    const role = tags[0] === "crane" ? "crane" : "phone";
    return {
      role,
      rateId: tags[1] || "anon",
      userId: tags[2] || undefined,
      expMs: parseExpMs(tags[3]),
      email: tags[4] || undefined,
      emailVerified: parseEmailVerified(tags[5]),
    };
  }
  let role: Role = "phone";
  let rateId = "anon";
  let userId: string | undefined;
  let expMs: number | undefined;
  let email: string | undefined;
  let emailVerified = false;
  for (const tag of tags) {
    if (tag === ROLE_CRANE) {
      role = "crane";
    } else if (tag === ROLE_PHONE) {
      role = "phone";
    } else if (tag.startsWith("rate:")) {
      rateId = tag.slice(5) || "anon";
    } else if (tag.startsWith("sub:")) {
      userId = tag.slice(4) || undefined;
    } else if (tag.startsWith("exp:")) {
      expMs = parseExpMs(tag.slice(4));
    } else if (tag.startsWith("email:")) {
      email = tag.slice(6) || undefined;
    } else if (tag === "verified:1") {
      emailVerified = true;
    }
  }
  return { role, rateId, userId, expMs, email, emailVerified };
}
