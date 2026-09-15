interface Env {
  MAILBOX: DurableObjectNamespace;
  DIRECTORY?: KVNamespace;
  ASSETS?: Fetcher;
  MAILBOX_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  ALLOWED_SUBS?: string;
  CRANE_BEARERS?: string;
  PENDANT_DEV?: string;
  /** Best-effort DO region (`wnam`, `enam`, `weur`, …). First `get()` wins. */
  LOCATION_HINT?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  /** Google Cloud Text-to-Speech key (restricted to that API). Absent = `/api/tts` is 404, hold-to-talk stays silent. */
  GOOGLE_TTS_API_KEY?: string;
  /** Chirp 3 HD voice name, e.g. `en-US-Chirp3-HD-Leda`. Wrangler var, not a secret. */
  TTS_VOICE?: string;
  /**
   * Pocket voice flag. `off` hides the mic even with a TTS key. `on` shows it
   * without a key (dictate only). Unset follows the key (`lib/tts/http.ts`).
   */
  VOICE?: string;
}
