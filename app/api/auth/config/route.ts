import { env } from "cloudflare:workers";
import { publicAuthConfig } from "@/lib/auth/mode";

export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(publicAuthConfig(env));
}
