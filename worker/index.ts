import handler from "vinext/server/app-router-entry";
import { handshake, rateId, roleFromQuery, stampEmail, stampUserId } from "../lib/auth/handshake";
import { resolveAuthMode } from "../lib/auth/mode";
import { stripUpgradeOp, upgradeOriginOk } from "../lib/auth/upgrade";
import { fetchRoomUsers } from "../lib/mailbox/allow";
import { slugFromPath } from "../lib/mailbox/slug";
import { Mailbox } from "./mailbox";

export { Mailbox };

function envOf(e: Env) {
  return {
    MAILBOX_SECRET: e.MAILBOX_SECRET,
    GOOGLE_CLIENT_ID: e.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: e.GOOGLE_CLIENT_SECRET,
    SESSION_SECRET: e.SESSION_SECRET,
    ALLOWED_SUBS: e.ALLOWED_SUBS,
    CRANE_BEARERS: e.CRANE_BEARERS,
  };
}

async function mailboxUpgrade(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const slug = slugFromPath(url.pathname);
  const role = roleFromQuery(url.searchParams.get("role"));
  if (!slug || !role) {
    return new Response("not found", { status: 404 });
  }
  if (!upgradeOriginOk(request.headers.get("Origin"), url.origin)) {
    return new Response("forbidden", { status: 403 });
  }
  const mode = resolveAuthMode(envOf(env));
  if (!mode.ok) {
    return Response.json({ error: "config" }, { status: 503 });
  }
  const id = env.MAILBOX.idFromName(slug);
  const stub = env.MAILBOX.get(id);
  const roomList = mode.mode === "oidc" && role === "phone"
    ? await fetchRoomUsers(stub)
    : undefined;
  const auth = await handshake({
    env: envOf(env),
    slug,
    role,
    cookieHeader: request.headers.get("Cookie"),
    authorization: request.headers.get("Authorization"),
    querySecret: url.searchParams.get("secret"),
    queryBearer: url.searchParams.get("bearer"),
    roomList,
  });
  if (!auth.ok) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const headers = new Headers(request.headers);
  headers.set("X-Pendant-Role", role);
  headers.set("X-Pendant-Rate", rateId(mode.mode, auth.principal));
  headers.set("X-Pendant-Slug", slug);
  const sub = stampUserId(auth.principal);
  if (sub) {
    headers.set("X-Pendant-Sub", sub);
  }
  const email = stampEmail(auth.principal);
  if (email) {
    headers.set("X-Pendant-Email", email);
  }
  if (auth.principal.kind === "phone" && auth.principal.emailVerified) {
    headers.set("X-Pendant-EmailVerified", "1");
  }
  if (auth.principal.kind === "phone" && auth.principal.exp !== undefined) {
    headers.set("X-Pendant-Exp", String(auth.principal.exp));
  }
  headers.delete("Authorization");
  stripUpgradeOp(headers);
  return stub.fetch(new Request(request, { headers }));
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/ws/")) {
      return mailboxUpgrade(request, env);
    }
    return handler.fetch(request, env, ctx);
  },
};
