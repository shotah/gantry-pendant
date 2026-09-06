import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { devEnabled, hostnameFromHostHeader } from "@/lib/dev/mode";

export const dynamic = "force-dynamic";

export default async function CraneLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const host = (await headers()).get("host");
  if (!devEnabled(env, hostnameFromHostHeader(host))) {
    notFound();
  }
  return children;
}
