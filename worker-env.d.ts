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
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}
