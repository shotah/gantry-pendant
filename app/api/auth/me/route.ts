import { env } from "cloudflare:workers";
import { unauthorized, tooMany } from "@/lib/auth/deny";
import { admittedCranes } from "@/lib/auth/directory";
import { limitAuthRequest } from "@/lib/auth/limit";
import { readSessionFromRequest } from "@/lib/auth/session";
import { fetchRoomUsers } from "@/lib/mailbox/allow";
import { mailboxStub } from "@/lib/mailbox/location";
import { parseSlug } from "@/lib/mailbox/slug";
import { DEV_USER } from "@/lib/dev/samples";
import { devEnabled, hostFromRequest } from "@/lib/dev/mode";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (devEnabled(env, hostFromRequest(req))) {
    return Response.json(DEV_USER);
  }
  const secret = env.SESSION_SECRET?.trim();
  if (!secret) {
    return unauthorized();
  }
  const session = await readSessionFromRequest(secret, {
    cookieHeader: req.headers.get("Cookie"),
    authorization: req.headers.get("Authorization"),
  });
  if (!session) {
    return unauthorized();
  }
  if (!limitAuthRequest(req, session.sub)) {
    return tooMany();
  }
  const typed = parseSlug(new URL(req.url).searchParams.get("slug") ?? "");
  const cranes = await admittedCranes({
    kv: env.DIRECTORY,
    slugs: typed ? [typed] : [],
    session: {
      sub: session.sub,
      email: session.email,
      emailVerified: session.emailVerified,
    },
    extraSubs: env.ALLOWED_SUBS,
    rooms: async (slug) => {
      const stub = mailboxStub(env, slug);
      if (!stub) {
        return [];
      }
      return fetchRoomUsers(stub);
    },
  });
  return Response.json({
    sub: session.sub,
    email: session.email,
    cranes,
  });
}
