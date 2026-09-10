import type { Role } from "@/lib/mailbox/frame";

/** Android Chrome keeps the mailbox socket OPEN while the page is frozen. */
export function shouldDropMailboxOnHide(role: Role, visibilityState: string): boolean {
  return role === "phone" && visibilityState === "hidden";
}

export function shouldReconnectMailbox(opts: {
  role: Role;
  visibilityState: string;
  stopped: boolean;
}): boolean {
  if (opts.stopped) {
    return false;
  }
  if (shouldDropMailboxOnHide(opts.role, opts.visibilityState)) {
    return false;
  }
  return true;
}
