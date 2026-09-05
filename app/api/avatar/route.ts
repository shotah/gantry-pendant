import { env } from "cloudflare:workers";
import { handshakeSlug } from "@/lib/auth/handshake";
import { configError, unauthorized } from "@/lib/auth/deny";
import { acceptJpeg } from "@/lib/avatar/jpeg";
import { readAvatarUpload } from "@/lib/avatar/http";
import { parseSlug } from "@/lib/mailbox/slug";
import { devEnabled, hostFromRequest } from "@/lib/dev/mode";

export const dynamic = "force-dynamic";

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

async function authorize(req: Request, slug: string): Promise<Response | null> {
  if (devEnabled(env, hostFromRequest(req))) {
    return null;
  }
  const url = new URL(req.url);
  const auth = await handshakeSlug({
    env: envOf(env),
    slug,
    cookieHeader: req.headers.get("Cookie"),
    authorization: req.headers.get("Authorization"),
    querySecret: url.searchParams.get("secret"),
    queryBearer: url.searchParams.get("bearer"),
  });
  if (auth.ok) {
    return null;
  }
  return auth.error === "config" ? configError() : unauthorized();
}

function stubFor(slug: string): DurableObjectStub | null {
  if (!env.MAILBOX) {
    return null;
  }
  return env.MAILBOX.get(env.MAILBOX.idFromName(slug));
}

async function withSlug(req: Request, next: (slug: string, stub: DurableObjectStub) => Promise<Response>): Promise<Response> {
  const slug = parseSlug(new URL(req.url).searchParams.get("slug") ?? "");
  if (!slug) {
    return Response.json({ error: "bad slug" }, { status: 400 });
  }
  const denied = await authorize(req, slug);
  if (denied) {
    return denied;
  }
  const stub = stubFor(slug);
  if (!stub) {
    return configError();
  }
  return next(slug, stub);
}

async function fromStub(res: Response): Promise<Response> {
  const buf = await res.arrayBuffer();
  const headers = new Headers();
  res.headers.forEach((v, k) => {
    headers.set(k, v);
  });
  return new Response(buf.byteLength ? buf : null, { status: res.status, headers });
}

export async function GET(req: Request) {
  return withSlug(req, async (_slug, stub) => fromStub(await stub.fetch(new Request("https://mailbox/avatar", {
    method: "GET",
    headers: { "X-Pendant-Op": "avatar" },
  }))));
}

export async function POST(req: Request) {
  return withSlug(req, async (_slug, stub) => {
    const got = await readAvatarUpload(req);
    if (!got.ok) {
      return Response.json({ error: got.detail }, { status: 400 });
    }
    const check = acceptJpeg(got.bytes);
    if (!check.ok) {
      return Response.json({ error: check.detail }, { status: 400 });
    }
    const buf = new ArrayBuffer(got.bytes.byteLength);
    new Uint8Array(buf).set(got.bytes);
    return fromStub(await stub.fetch(new Request("https://mailbox/avatar", {
      method: "PUT",
      headers: {
        "X-Pendant-Op": "avatar",
        "Content-Type": "image/jpeg",
      },
      body: buf,
    })));
  });
}
