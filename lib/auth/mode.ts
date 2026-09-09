export type AuthMode = "spike" | "oidc";
export type ConfigGap = "session" | "crane";

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

export type PublicAuthConfig = {
  mode: AuthMode | null;
  google: boolean;
  gap: ConfigGap | null;
};

export const CONFIG_GAP_COPY: Record<ConfigGap, { heading: string; detail: string }> = {
  crane: {
    heading: "No crane on this mailbox yet",
    detail: "Gantree Build → channel pendant, then recreate. That pushes the bearer. Sign in with Google after it lands.",
  },
  session: {
    heading: "Settings hasn't landed on the Worker",
    detail: "Gantree Settings → Pendant: Save. That pushes Google + session. Then Build a crane.",
  },
};

/**
 * Google configured → production (spike secret is gone).
 * `ALLOWED_SUBS` is an optional yard-wide extra, not a requirement.
 * Otherwise a shared mailbox secret is the two-tab spike.
 */
export function resolveAuthMode(env: AuthEnv): ModeResult {
  const google = env.GOOGLE_CLIENT_ID?.trim() ?? "";
  if (google) {
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

/** Why Google is on but oidc is not ready. Session before crane (Settings, then Build). */
export function configGap(env: AuthEnv): ConfigGap | null {
  if (!env.GOOGLE_CLIENT_ID?.trim()) {
    return null;
  }
  if (!env.SESSION_SECRET?.trim()) {
    return "session";
  }
  if (!env.CRANE_BEARERS?.trim()) {
    return "crane";
  }
  return null;
}

export function publicAuthConfig(env: AuthEnv): PublicAuthConfig {
  const resolved = resolveAuthMode(env);
  return {
    mode: resolved.ok ? resolved.mode : null,
    google: Boolean(env.GOOGLE_CLIENT_ID?.trim()),
    gap: configGap(env),
  };
}

/** `/api/auth/google` sends the phone home instead of a JSON 503. */
export function blockedGoogleStartLocation(env: AuthEnv): "/" | null {
  const mode = resolveAuthMode(env);
  if (mode.ok && mode.mode === "oidc" && env.GOOGLE_CLIENT_ID?.trim()) {
    return null;
  }
  return "/";
}
