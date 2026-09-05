export type AuthMode = "spike" | "oidc";

export type ModeOk = { ok: true; mode: AuthMode };
export type ModeErr = { ok: false; error: string };
export type ModeResult = ModeOk | ModeErr;

export type AuthEnv = {
  GOOGLE_CLIENT_ID?: string;
  ALLOWED_SUBS?: string;
  MAILBOX_SECRET?: string;
  CRANE_BEARERS?: string;
  SESSION_SECRET?: string;
};

/**
 * Google configured → production (spike secret is gone).
 * Otherwise a shared mailbox secret is the two-tab spike.
 */
export function resolveAuthMode(env: AuthEnv): ModeResult {
  const google = env.GOOGLE_CLIENT_ID?.trim() ?? "";
  if (google) {
    if (!env.ALLOWED_SUBS?.trim()) {
      return { ok: false, error: "config" };
    }
    if (!env.SESSION_SECRET?.trim()) {
      return { ok: false, error: "config" };
    }
    if (!env.CRANE_BEARERS?.trim()) {
      return { ok: false, error: "config" };
    }
    return { ok: true, mode: "oidc" };
  }
  if (env.MAILBOX_SECRET?.trim()) {
    return { ok: true, mode: "spike" };
  }
  return { ok: false, error: "config" };
}

export function publicAuthConfig(env: AuthEnv): { mode: AuthMode | null; google: boolean } {
  const resolved = resolveAuthMode(env);
  return {
    mode: resolved.ok ? resolved.mode : null,
    google: Boolean(env.GOOGLE_CLIENT_ID?.trim()),
  };
}
