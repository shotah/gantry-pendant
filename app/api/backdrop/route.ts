import { env } from "cloudflare:workers";
import { fromStub, withSlug } from "@/lib/auth/slugRoute";
import { conditionalHeaders } from "@/lib/avatar/http";
import { acceptJpeg } from "@/lib/avatar/jpeg";
import { readBackdropUpload } from "@/lib/backdrop/http";

export const dynamic = "force-dynamic";

const OP = { "X-Pendant-Op": "backdrop" };

export async function GET(req: Request) {
  return withSlug(env, req, async (_slug, stub) => fromStub(await stub.fetch(new Request("https://mailbox/backdrop", {
    method: "GET",
    headers: { ...OP, ...conditionalHeaders(req) },
  }))));
}

export async function POST(req: Request) {
  return withSlug(env, req, async (_slug, stub) => {
    const got = await readBackdropUpload(req);
    if (!got.ok) {
      return Response.json({ error: got.detail }, { status: 400 });
    }
    const check = acceptJpeg(got.bytes);
    if (!check.ok) {
      return Response.json({ error: check.detail }, { status: 400 });
    }
    const buf = new ArrayBuffer(got.bytes.byteLength);
    new Uint8Array(buf).set(got.bytes);
    return fromStub(await stub.fetch(new Request("https://mailbox/backdrop", {
      method: "PUT",
      headers: { ...OP, "Content-Type": "image/jpeg" },
      body: buf,
    })));
  });
}

/** Clear it: the thread goes back to the theme canvas on every phone. */
export async function DELETE(req: Request) {
  return withSlug(env, req, async (_slug, stub) => fromStub(await stub.fetch(new Request("https://mailbox/backdrop", {
    method: "DELETE",
    headers: OP,
  }))));
}
