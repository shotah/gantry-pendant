import { env } from "cloudflare:workers";
import { unauthorized } from "@/lib/auth/deny";
import { allowlistMap } from "@/lib/auth/allowlist";
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
  const allowed = allowlistMap(env.ALLOWED_SUBS);
  if (!session || !allowed.has(session.sub)) {
    return unauthorized();
  }
  return Response.json({ sub: session.sub, email: session.email ?? allowed.get(session.sub) });
}
