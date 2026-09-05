import { env } from "cloudflare:workers";
import { publicAuthConfig } from "@/lib/auth/mode";
import { devEnabled, hostFromRequest } from "@/lib/dev/mode";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  return Response.json({
    ...publicAuthConfig(env),
    dev: devEnabled(env, hostFromRequest(req)),
  });
}
