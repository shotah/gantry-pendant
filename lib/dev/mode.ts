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

/** `Host` may include a port (`127.0.0.1:5173`). Strip before `devEnabled`. */
export function hostnameFromHostHeader(host: string | null | undefined): string {
  const raw = (host ?? "").trim();
  if (!raw) {
    return "";
  }
  try {
    return new URL(`http://${raw}`).hostname;
  } catch {
    return "";
  }
}

export function devEnabled(env: DevEnv, host: string): boolean {
  return envFlag(env.PENDANT_DEV) && loopbackHost(host);
}
