import { env } from "cloudflare:workers";
import { configError, forbidden, tooLarge, tooMany, unauthorized, badFrame } from "@/lib/auth/deny";
import { handshake, stampEmail, stampUserId } from "@/lib/auth/handshake";
import { limitAuthRequest } from "@/lib/auth/limit";
import { readSessionFromRequest } from "@/lib/auth/session";
import { fetchRoomUsers } from "@/lib/mailbox/allow";
import { headerSaysTooLarge } from "@/lib/mailbox/caps";
import { mailboxStub } from "@/lib/mailbox/location";
import { parseSlug } from "@/lib/mailbox/slug";
import { parsePushDelete, parsePushPut } from "@/lib/push/subscription";
import { readVapid } from "@/lib/push/vapid";
import { hostFromRequest } from "@/lib/dev/mode";

export const dynamic = "force-dynamic";

const PUSH_JSON_MAX = 8_192;

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

function stubFor(slug: string): DurableObjectStub | null {
  return mailboxStub(env, slug);
}

export async function GET(req: Request) {
  const vapid = readVapid(env);
  if (!vapid) {
    return new Response(null, { status: 404 });
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
  return Response.json({ publicKey: vapid.publicKey });
}

export async function PUT(req: Request) {
  return mutate(req, "PUT");
}

export async function DELETE(req: Request) {
  return mutate(req, "DELETE");
}

async function mutate(req: Request, method: "PUT" | "DELETE"): Promise<Response> {
  const vapid = readVapid(env);
  if (!vapid) {
    return new Response(null, { status: 404 });
  }
  if (headerSaysTooLarge(req.headers.get("content-length"), PUSH_JSON_MAX)) {
    return tooLarge();
  }
  let buf: ArrayBuffer;
  try {
    buf = await req.arrayBuffer();
  } catch {
    return badFrame();
  }
  if (buf.byteLength > PUSH_JSON_MAX) {
    return tooLarge();
  }
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(buf)) as unknown;
  } catch {
    return badFrame();
  }
  const parsed = method === "PUT" ? parsePushPut(raw) : parsePushDelete(raw);
  if (!parsed) {
    return badFrame();
  }
  const slug = parseSlug(parsed.slug);
  if (!slug) {
    return unauthorized();
  }
  const stub = stubFor(slug);
  const roomList = stub ? await fetchRoomUsers(stub) : [];
  const auth = await handshake({
    env: envOf(env),
    slug,
    role: "phone",
    cookieHeader: req.headers.get("Cookie"),
    authorization: req.headers.get("Authorization"),
    roomList,
    host: hostFromRequest(req),
  });
  if (!auth.ok) {
    if (auth.error === "config") {
      return configError();
    }
    if (auth.error === "forbidden") {
      return forbidden();
    }
    return unauthorized();
  }
  const sub = stampUserId(auth.principal);
  if (!sub) {
    return unauthorized();
  }
  if (!limitAuthRequest(req, sub)) {
    return tooMany();
  }
  if (!stub) {
    return configError();
  }
  const headers = new Headers({
    "X-Pendant-Op": "push",
    "X-Pendant-Sub": sub,
    "Content-Type": "application/json",
  });
  const email = stampEmail(auth.principal);
  if (email) {
    headers.set("X-Pendant-Email", email);
  }
  if (auth.principal.kind === "phone" && auth.principal.emailVerified) {
    headers.set("X-Pendant-EmailVerified", "1");
  }
  const body = JSON.stringify(parsed);
  if (body.length > PUSH_JSON_MAX) {
    return tooLarge();
  }
  return stub.fetch(new Request("https://mailbox/push", { method, headers, body }));
}
