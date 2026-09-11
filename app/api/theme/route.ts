import { env } from "cloudflare:workers";
import { fromStub, withSlug } from "@/lib/auth/slugRoute";
import { parseThemeWrite } from "@/lib/theme/store";

export const dynamic = "force-dynamic";

const OP = { "X-Pendant-Op": "theme" };

export async function GET(req: Request) {
  return withSlug(env, req, async (_slug, stub) => fromStub(await stub.fetch(new Request("https://mailbox/theme", {
    method: "GET",
    headers: OP,
  }))));
}

export async function POST(req: Request) {
  return withSlug(env, req, async (_slug, stub) => {
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return Response.json({ error: "bad theme" }, { status: 400 });
    }
    const got = parseThemeWrite(raw);
    if (!got.ok) {
      return Response.json({ error: got.detail }, { status: 400 });
    }
    return fromStub(await stub.fetch(new Request("https://mailbox/theme", {
      method: "PUT",
      headers: { ...OP, "Content-Type": "application/json" },
      body: JSON.stringify({ theme: got.theme }),
    })));
  });
}

/** Clear it: phones that follow Kit fall back to the theme they picked. */
export async function DELETE(req: Request) {
  return withSlug(env, req, async (_slug, stub) => fromStub(await stub.fetch(new Request("https://mailbox/theme", {
    method: "DELETE",
    headers: OP,
  }))));
}
