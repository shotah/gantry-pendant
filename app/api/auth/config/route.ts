import { env } from "cloudflare:workers";
import { publicAuthConfig } from "@/lib/auth/mode";
import { devEnabled, hostFromRequest } from "@/lib/dev/mode";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const host = hostFromRequest(req);
  return Response.json({
    ...publicAuthConfig(env, host),
    dev: devEnabled(env, host),
  });
}
