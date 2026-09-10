import type { Role } from "../mailbox/frame";

/** Browser Origin must match the request URL origin. Missing Origin (Go crane) is allowed. */
export function upgradeOriginOk(originHeader: string | null, urlOrigin: string): boolean {
  if (originHeader === null) {
    return true;
  }
  return originHeader === urlOrigin;
}

const PENDANT_HEADER = "x-pendant-";

/** Drop every `X-Pendant-*` so a client cannot pre-set Sub / Email / Op / Exp. */
export function stripUpgradeOp(headers: Headers): void {
  const names: string[] = [];
  headers.forEach((_value, name) => {
    if (name.toLowerCase().startsWith(PENDANT_HEADER)) {
      names.push(name);
    }
  });
  for (const name of names) {
    headers.delete(name);
  }
}

export type UpgradeStamp = {
  role: Role;
  rateId: string;
  slug: string;
  userId?: string;
  email?: string;
  emailVerified?: boolean;
  exp?: number;
};

/** Copy the upgrade request, strip client stamps, write the principal the Worker earned. */
export function stampMailboxHeaders(request: Request, stamp: UpgradeStamp): Headers {
  const headers = new Headers(request.headers);
  stripUpgradeOp(headers);
  headers.set("X-Pendant-Role", stamp.role);
  headers.set("X-Pendant-Rate", stamp.rateId);
  headers.set("X-Pendant-Slug", stamp.slug);
  if (stamp.userId) {
    headers.set("X-Pendant-Sub", stamp.userId);
  }
  if (stamp.email) {
    headers.set("X-Pendant-Email", stamp.email);
  }
  if (stamp.emailVerified) {
    headers.set("X-Pendant-EmailVerified", "1");
  }
  if (stamp.exp != null) {
    headers.set("X-Pendant-Exp", String(stamp.exp));
  }
  headers.delete("Authorization");
  return headers;
}
