import { env } from "cloudflare:workers";
import { fromStub, withSlug } from "@/lib/auth/slugRoute";
import { acceptJpeg } from "@/lib/avatar/jpeg";
import { conditionalHeaders, readAvatarUpload } from "@/lib/avatar/http";

export const dynamic = "force-dynamic";

const OP = { "X-Pendant-Op": "avatar" };

export async function GET(req: Request) {
  return withSlug(env, req, async (_slug, stub) => fromStub(await stub.fetch(new Request("https://mailbox/avatar", {
    method: "GET",
    headers: { ...OP, ...conditionalHeaders(req) },
  }))));
}

export async function POST(req: Request) {
  return withSlug(env, req, async (_slug, stub) => {
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
      headers: { ...OP, "Content-Type": "image/jpeg" },
      body: buf,
    })));
  });
}
