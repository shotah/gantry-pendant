import { hasGeo, hasImages, hasText, type FrameKind, type Role, type WireFrame } from "./frame";
import { shouldQueue } from "./queue";

const PHONE_KINDS = new Set<FrameKind>(["inbound", "pin", "ack"]);

/** Phone may send inbound | pin | ack. Default inbound (text/images) or pin (geo-only). */
export function resolvePhoneKind(frame: WireFrame): FrameKind | undefined {
  if (frame.kind) {
    return PHONE_KINDS.has(frame.kind) ? frame.kind : undefined;
  }
  if (hasText(frame) || hasImages(frame)) {
    return "inbound";
  }
  if (hasGeo(frame)) {
    return "pin";
  }
  return undefined;
}

export function phoneKindAllowed(frame: WireFrame): boolean {
  return resolvePhoneKind(frame) != null;
}

/**
 * Tag for `getWebSockets`. Phone-originated frames go to crane.
 * Crane `reply` requires `user_id`. Crane `push` with no `user_id` is `"phone"`.
 */
export function routeTag(from: Role, frame: WireFrame): string | undefined {
  if (from === "phone") {
    return "crane";
  }
  if (frame.kind === "push") {
    return frame.user_id || "phone";
  }
  if (frame.kind === "reply" || frame.kind === "typing") {
    return frame.user_id || undefined;
  }
  if (frame.kind === "error" && frame.user_id) {
    return frame.user_id;
  }
  return "phone";
}

/** Phone-bound frames always persist; crane-bound inbound persists only when no crane socket. */
export function persistRole(from: Role, kind?: FrameKind, userId?: string): Role | undefined {
  if (!shouldQueue(kind)) {
    return undefined;
  }
  if (from === "phone") {
    return "crane";
  }
  if (kind === "reply") {
    return userId ? "phone" : undefined;
  }
  if (kind === "push" || kind === "error") {
    return "phone";
  }
  return undefined;
}
