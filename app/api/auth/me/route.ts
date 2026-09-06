import { env } from "cloudflare:workers";
import { unauthorized, tooMany } from "@/lib/auth/deny";
import { cranesFor } from "@/lib/auth/directory";
import { limitAuthRequest } from "@/lib/auth/limit";
import { parseCookie, readSession, SESSION_COOKIE } from "@/lib/auth/session";
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
  const cranes = env.DIRECTORY
    ? await cranesFor(env.DIRECTORY, session.sub, session.email)
    : [];
  return Response.json({
    sub: session.sub,
    email: session.email,
    cranes,
  });
}
