import type { Role } from "./frame";

export function phoneMustNotPublishDraft(role: Role, kind?: string): boolean {
  return role === "phone" && kind === "draft";
}

export function cranePublishedDraft(role: Role, kind?: string): boolean {
  return role === "crane" && kind === "draft";
}
