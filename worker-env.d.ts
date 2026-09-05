interface Env {
  MAILBOX: DurableObjectNamespace;
  ASSETS?: Fetcher;
  MAILBOX_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  ALLOWED_SUBS?: string;
  CRANE_BEARERS?: string;
}
