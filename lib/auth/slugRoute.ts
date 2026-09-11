import { configError, forbidden, unauthorized } from "./deny";
import { handshakeSlug } from "./handshake";
import type { AuthEnv } from "./mode";
import { devEnabled, hostFromRequest, type DevEnv } from "../dev/mode";
import { fetchRoomUsers } from "../mailbox/allow";
import { mailboxStub, type MailboxBinding } from "../mailbox/location";
import { parseSlug } from "../mailbox/slug";

/** Per-slug room routes (`/api/avatar`, `/api/backdrop`, `/api/theme`): same door, same denies. */

export type SlugRouteEnv = AuthEnv & MailboxBinding & DevEnv;

function envOf(e: SlugRouteEnv): AuthEnv {
  return {
    MAILBOX_SECRET: e.MAILBOX_SECRET,
    GOOGLE_CLIENT_ID: e.GOOGLE_CLIENT_ID,
    SESSION_SECRET: e.SESSION_SECRET,
    ALLOWED_SUBS: e.ALLOWED_SUBS,
    CRANE_BEARERS: e.CRANE_BEARERS,
  };
}

/** Null when the caller may touch this slug; otherwise the deny response. */
export async function authorizeSlug(env: SlugRouteEnv, req: Request, slug: string): Promise<Response | null> {
  if (devEnabled(env, hostFromRequest(req))) {
    return null;
  }
  const url = new URL(req.url);
  const stub = mailboxStub(env, slug);
  const roomList = stub ? await fetchRoomUsers(stub) : [];
  const auth = await handshakeSlug({
    env: envOf(env),
    slug,
    cookieHeader: req.headers.get("Cookie"),
    authorization: req.headers.get("Authorization"),
    querySecret: url.searchParams.get("secret"),
    queryBearer: url.searchParams.get("bearer"),
    roomList,
    host: hostFromRequest(req),
  });
  if (auth.ok) {
    return null;
  }
  if (auth.error === "config") {
    return configError();
  }
  if (auth.error === "forbidden") {
    return forbidden();
  }
  return unauthorized();
}

export async function withSlug(
  env: SlugRouteEnv,
  req: Request,
  next: (slug: string, stub: DurableObjectStub) => Promise<Response>,
): Promise<Response> {
  const slug = parseSlug(new URL(req.url).searchParams.get("slug") ?? "");
  if (!slug) {
    return Response.json({ error: "bad slug" }, { status: 400 });
  }
  const denied = await authorizeSlug(env, req, slug);
  if (denied) {
    return denied;
  }
  const stub = mailboxStub(env, slug);
  if (!stub) {
    return configError();
  }
  return next(slug, stub);
}

/** Re-wrap a Durable Object response so the Worker owns the body stream. */
export async function fromStub(res: Response): Promise<Response> {
  const buf = await res.arrayBuffer();
  const headers = new Headers();
  res.headers.forEach((v, k) => {
    headers.set(k, v);
  });
  return new Response(buf.byteLength ? buf : null, { status: res.status, headers });
}
