import { hasText, type Role, type WireFrame } from "./frame";

export function phoneMustNotPublishDraft(role: Role, kind?: string): boolean {
  return role === "phone" && kind === "draft";
}

export function cranePublishedDraft(role: Role, kind?: string): boolean {
  return role === "crane" && kind === "draft";
}

/**
 * A `draft` with no words. Every mouth reads blank as "remove the bubble", so
 * the mailbox drops it before fan-out: a crane resetting its buffer at a tool
 * call must not blank the phone. Ending a turn is `reply` or `error`.
 */
export function blankDraft(frame: Pick<WireFrame, "text">): boolean {
  return !hasText(frame);
}

/** The frames that end an in-progress answer; the held draft for that human goes with them. */
export function clearsDraft(kind?: string): boolean {
  return kind === "reply" || kind === "error";
}
