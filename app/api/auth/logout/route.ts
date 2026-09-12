import { clearCookie, SESSION_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

function leave(req: Request) {
  const secure = new URL(req.url).origin.startsWith("https:");
  return new Response(null, {
    status: 302,
    headers: {
      Location: "/",
      "Set-Cookie": clearCookie(SESSION_COOKIE, secure),
    },
  });
}

export function POST(req: Request) {
  return leave(req);
}
