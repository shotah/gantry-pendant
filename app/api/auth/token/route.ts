import { env } from "cloudflare:workers";
import { configError, tooMany, unauthorized } from "@/lib/auth/deny";
import { limitAuthIp, limitAuthSub } from "@/lib/auth/limit";
import { resolveAuthMode } from "@/lib/auth/mode";
import { mintNativeSession, parseNativeTokenBody } from "@/lib/auth/native";

export const dynamic = "force-dynamic";

/** Native cab: Google ID token + nonce → Worker session JWE (not a cookie). */
export async function POST(req: Request) {
  if (!limitAuthIp(req)) {
    return tooMany();
  }
  const mode = resolveAuthMode({
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    SESSION_SECRET: env.SESSION_SECRET,
    ALLOWED_SUBS: env.ALLOWED_SUBS,
    CRANE_BEARERS: env.CRANE_BEARERS,
    MAILBOX_SECRET: env.MAILBOX_SECRET,
  });
  if (!mode.ok) {
    return configError();
  }
  if (mode.mode !== "oidc") {
    return unauthorized();
  }
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return unauthorized();
  }
  const body = parseNativeTokenBody(parsed);
  if (!body) {
    return unauthorized();
  }
  const session = await mintNativeSession({
    idToken: body.idToken,
    nonce: body.nonce,
    clientId: env.GOOGLE_CLIENT_ID ?? "",
    sessionSecret: env.SESSION_SECRET ?? "",
  });
  if (!session) {
    return unauthorized();
  }
  if (!limitAuthSub(session.sub)) {
    return tooMany();
  }
  return Response.json({
    token: session.token,
    sub: session.sub,
    email: session.email,
    exp: session.exp,
  });
}
