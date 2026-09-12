import { env } from "cloudflare:workers";
import { configError, tooMany, unauthorized } from "@/lib/auth/deny";
import { limitAuthIp } from "@/lib/auth/limit";
import { resolveAuthMode } from "@/lib/auth/mode";
import { issueNativeNonce, nativeNonceStore, putIssuedNonce } from "@/lib/auth/nonce";
import { hostFromRequest } from "@/lib/dev/mode";

export const dynamic = "force-dynamic";

/** Cab: GET nonce → Google Sign-In → POST /api/auth/token. 404-shaped 401 on spike. */
export async function GET(req: Request) {
  if (!limitAuthIp(req)) {
    return tooMany();
  }
  const mode = resolveAuthMode({
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    SESSION_SECRET: env.SESSION_SECRET,
    ALLOWED_SUBS: env.ALLOWED_SUBS,
    CRANE_BEARERS: env.CRANE_BEARERS,
    MAILBOX_SECRET: env.MAILBOX_SECRET,
  }, hostFromRequest(req));
  if (!mode.ok) {
    return configError();
  }
  if (mode.mode !== "oidc") {
    return unauthorized();
  }
  const issued = issueNativeNonce();
  await putIssuedNonce(nativeNonceStore(env.DIRECTORY), issued);
  return Response.json({ nonce: issued.nonce, exp: issued.exp });
}
