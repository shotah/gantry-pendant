import { env } from "cloudflare:workers";
import { configError } from "@/lib/auth/deny";
import { authorizeUrl, encodeOAuthBind, newNonce, newPkce, newState } from "@/lib/auth/google";
import { resolveAuthMode } from "@/lib/auth/mode";
import { stateCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const mode = resolveAuthMode(env);
  if (!mode.ok || mode.mode !== "oidc" || !env.GOOGLE_CLIENT_ID) {
    return configError();
  }
  const origin = new URL(req.url).origin;
  const state = newState();
  const pkce = newPkce();
  const nonce = newNonce();
  const location = authorizeUrl({
    clientId: env.GOOGLE_CLIENT_ID,
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
