import { env } from "cloudflare:workers";
import { authorizeUrl, encodeOAuthBind, newNonce, newPkce, newState } from "@/lib/auth/google";
import { blockedGoogleStartLocation } from "@/lib/auth/mode";
import { stateCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const blocked = blockedGoogleStartLocation(env);
  if (blocked) {
    return new Response(null, { status: 302, headers: { Location: blocked } });
  }
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const origin = new URL(req.url).origin;
  const state = newState();
  const pkce = newPkce();
  const nonce = newNonce();
  const location = authorizeUrl({
    clientId,
    origin,
    state,
    codeChallenge: pkce.challenge,
    nonce,
  });
  const secure = origin.startsWith("https:");
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Set-Cookie": stateCookie(encodeOAuthBind({ state, verifier: pkce.verifier, nonce }), secure),
    },
  });
}
