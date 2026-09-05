/** Loopback-only mock mouth. Never on workers.dev. */

export type DevEnv = { PENDANT_DEV?: string };

export function envFlag(v: string | undefined): boolean {
  const s = (v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

export function loopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, "");
  return h === "127.0.0.1" || h === "localhost" || h === "::1";
}

export function hostFromRequest(req: Request): string {
  return new URL(req.url).hostname;
}

export function devEnabled(env: DevEnv, host: string): boolean {
  return envFlag(env.PENDANT_DEV) && loopbackHost(host);
}
