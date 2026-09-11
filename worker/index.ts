import handler from "vinext/server/app-router-entry";
import { handshake, handshakePhone, rateId, roleFromQuery, stampEmail, stampUserId } from "../lib/auth/handshake";
import { resolveAuthMode } from "../lib/auth/mode";
import { stampMailboxHeaders, upgradeOriginOk } from "../lib/auth/upgrade";
import { fetchRoomUsers } from "../lib/mailbox/allow";
import { mailboxStub } from "../lib/mailbox/location";
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
  const host = url.hostname;
  const authEnv = envOf(env);
  const mode = resolveAuthMode(authEnv, host);
  if (!mode.ok) {
    return Response.json({ error: "config" }, { status: 503 });
  }
  const handshakeIn = {
    env: authEnv,
    slug,
    cookieHeader: request.headers.get("Cookie"),
    authorization: request.headers.get("Authorization"),
    querySecret: url.searchParams.get("secret"),
    queryBearer: url.searchParams.get("bearer"),
    host,
  };
  const auth = role === "phone"
    ? await handshakePhone({
        ...handshakeIn,
        loadRoom: async () => {
          const stub = mailboxStub(env, slug);
          return stub ? fetchRoomUsers(stub) : [];
        },
      })
    : await handshake({ ...handshakeIn, role });
  if (!auth.ok) {
    if (auth.error === "config") {
      return Response.json({ error: "config" }, { status: 503 });
    }
    if (auth.error === "forbidden") {
      return Response.json({ error: "unauthorized" }, { status: 403 });
    }
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const headers = stampMailboxHeaders(request, {
    role,
    rateId: rateId(mode.mode, auth.principal),
    slug,
    userId: stampUserId(auth.principal),
    email: stampEmail(auth.principal),
    emailVerified: auth.principal.kind === "phone" && auth.principal.emailVerified,
    exp: auth.principal.kind === "phone" ? auth.principal.exp : undefined,
  });
  const stub = mailboxStub(env, slug);
  if (!stub) {
    return new Response("not found", { status: 404 });
  }
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
