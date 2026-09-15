import { allowlistMap } from "./allowlist";
import { parseBearers } from "./bearer";
import { admittedCranes, type DirectoryKv } from "./directory";
import type { GoogleIdentity } from "./google";
import { fetchRoomUsers } from "../mailbox/allow";
import { mailboxStub, type MailboxBinding } from "../mailbox/location";

/**
 * Sign-in door. A verified Google account is not a user until some crane
 * lists it. Checked once, when a session is minted (PWA callback, native
 * token); rooms keep checking on every frame after that.
 */

export type DoorEnv = MailboxBinding & {
  DIRECTORY?: DirectoryKv | null;
  CRANE_BEARERS?: string;
  ALLOWED_SUBS?: string;
};

/**
 * True when `ALLOWED_SUBS` names the sub, the KV directory has it, or any
 * crane slug in `CRANE_BEARERS` lists it in its Durable Object room.
 * Email counts only when Google verified it — same rule as `roomAllows`.
 */
export async function onSomeCrane(env: DoorEnv, identity: GoogleIdentity): Promise<boolean> {
  if (allowlistMap(env.ALLOWED_SUBS).has(identity.sub)) {
    return true;
  }
  const cranes = await admittedCranes({
    kv: env.DIRECTORY,
    slugs: parseBearers(env.CRANE_BEARERS).keys(),
    session: {
      sub: identity.sub,
      email: identity.emailVerified ? identity.email : undefined,
      emailVerified: identity.emailVerified,
    },
    extraSubs: env.ALLOWED_SUBS,
    rooms: async (slug) => {
      const stub = mailboxStub(env, slug);
      return stub ? fetchRoomUsers(stub) : [];
    },
  });
  return cranes.length > 0;
}
