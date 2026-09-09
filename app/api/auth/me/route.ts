import { env } from "cloudflare:workers";
import { unauthorized, tooMany } from "@/lib/auth/deny";
import { parseBearers } from "@/lib/auth/bearer";
import { admittedCranes } from "@/lib/auth/directory";
import { limitAuthRequest } from "@/lib/auth/limit";
import { parseCookie, readSession, SESSION_COOKIE } from "@/lib/auth/session";
import { fetchRoomUsers } from "@/lib/mailbox/allow";
import { parseSlug } from "@/lib/mailbox/slug";
import { DEV_USER } from "@/lib/dev/samples";
import { devEnabled, hostFromRequest } from "@/lib/dev/mode";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (devEnabled(env, hostFromRequest(req))) {
    return Response.json(DEV_USER);
  }
  const secret = env.SESSION_SECRET?.trim();
  const token = parseCookie(req.headers.get("Cookie"), SESSION_COOKIE);
  if (!secret || !token) {
    return unauthorized();
  }
  const session = await readSession(secret, token);
  if (!session) {
    return unauthorized();
  }
  if (!limitAuthRequest(req, session.sub)) {
    return tooMany();
  }
  const typed = parseSlug(new URL(req.url).searchParams.get("slug") ?? "");
  const slugs = [...parseBearers(env.CRANE_BEARERS).keys()];
  if (typed) {
    slugs.push(typed);
  }
  const cranes = await admittedCranes({
    kv: env.DIRECTORY,
    slugs,
    session: {
      sub: session.sub,
      email: session.email,
      emailVerified: session.emailVerified,
    },
    extraSubs: env.ALLOWED_SUBS,
    rooms: async (slug) => {
      if (!env.MAILBOX) {
        return [];
      }
      return fetchRoomUsers(env.MAILBOX.get(env.MAILBOX.idFromName(slug)));
    },
  });
  return Response.json({
    sub: session.sub,
    email: session.email,
    cranes,
  });
}
