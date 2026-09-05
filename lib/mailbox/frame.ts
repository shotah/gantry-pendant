import { CONTEXT_JSON_MAX, FRAME_BYTES_MAX, IMAGE_BYTES_MAX, IMAGE_MAX, TEXT_MAX, utf8Bytes } from "./caps";

export type Role = "phone" | "crane";

export type Geo = {
  lat: number;
  lon: number;
  accuracy_m?: number;
  alt_m?: number;
  heading?: number;
  speed_mps?: number;
};

export type PhoneContext = {
  at?: string;
  tz?: string;
  geo?: Geo;
  battery?: { pct: number; charging: boolean };
  net?: "wifi" | "cellular" | "unknown";
};

export type FrameImage = { url: string };

export type FrameKind = "inbound" | "reply" | "push" | "ack" | "error" | "pin";

export type WireFrame = {
  text?: string;
  images?: FrameImage[];
  context?: PhoneContext;
  kind?: FrameKind;
  user_id?: string;
};

export type ParseOk = { ok: true; frame: WireFrame; bytes: number };
export type ParseErr = { ok: false; error: string };
export type ParseResult = ParseOk | ParseErr;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function parseGeo(raw: unknown): Geo | undefined {
  if (raw == null || typeof raw !== "object") {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  if (!isFiniteNumber(o.lat) || !isFiniteNumber(o.lon)) {
    return undefined;
  }
  if (o.lat < -90 || o.lat > 90 || o.lon < -180 || o.lon > 180) {
    return undefined;
  }
  const geo: Geo = { lat: o.lat, lon: o.lon };
  if (isFiniteNumber(o.accuracy_m) && o.accuracy_m >= 0) {
    geo.accuracy_m = o.accuracy_m;
  }
  if (isFiniteNumber(o.alt_m)) {
    geo.alt_m = o.alt_m;
  }
  if (isFiniteNumber(o.heading) && o.heading >= 0 && o.heading < 360) {
    geo.heading = o.heading;
  }
  if (isFiniteNumber(o.speed_mps) && o.speed_mps >= 0) {
    geo.speed_mps = o.speed_mps;
  }
  return geo;
}

function parseContext(raw: unknown): PhoneContext | undefined {
  if (raw == null || typeof raw !== "object") {
    return undefined;
  }
  const o = raw as Record<string, unknown>;
  const ctx: PhoneContext = {};
  if (typeof o.at === "string" && o.at.length <= 64) {
    ctx.at = o.at;
  }
  if (typeof o.tz === "string" && o.tz.length <= 64) {
    ctx.tz = o.tz;
  }
  const geo = parseGeo(o.geo);
  if (geo) {
    ctx.geo = geo;
  }
  if (o.battery && typeof o.battery === "object") {
    const b = o.battery as Record<string, unknown>;
    if (isFiniteNumber(b.pct) && b.pct >= 0 && b.pct <= 100 && typeof b.charging === "boolean") {
      ctx.battery = { pct: b.pct, charging: b.charging };
    }
  }
  if (o.net === "wifi" || o.net === "cellular" || o.net === "unknown") {
    ctx.net = o.net;
  }
  return ctx;
}

function parseImages(raw: unknown): FrameImage[] | ParseErr {
  if (raw == null) {
    return [];
  }
  if (!Array.isArray(raw)) {
    return { ok: false, error: "bad frame" };
  }
  if (raw.length > IMAGE_MAX) {
    return { ok: false, error: "too large" };
  }
  const out: FrameImage[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      return { ok: false, error: "bad frame" };
    }
    const url = (item as Record<string, unknown>).url;
    if (typeof url !== "string" || url.length === 0) {
      return { ok: false, error: "bad frame" };
    }
    if (!url.startsWith("data:image/") && !url.startsWith("https://")) {
      return { ok: false, error: "bad frame" };
    }
    if (utf8Bytes(url) > IMAGE_BYTES_MAX) {
      return { ok: false, error: "too large" };
    }
    out.push({ url });
  }
  return out;
}

const KINDS = new Set<FrameKind>(["inbound", "reply", "push", "ack", "error", "pin"]);

/** Parse a mailbox frame. Never logs the body. */
export function parseFrame(raw: string | ArrayBuffer | Uint8Array): ParseResult {
  const text = typeof raw === "string" ? raw : new TextDecoder().decode(raw);
  const bytes = utf8Bytes(text);
  if (bytes > FRAME_BYTES_MAX) {
    return { ok: false, error: "too large" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: "bad frame" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "bad frame" };
  }
  const o = parsed as Record<string, unknown>;
  const frame: WireFrame = {};
  if (o.text != null) {
    if (typeof o.text !== "string") {
      return { ok: false, error: "bad frame" };
    }
    if (utf8Bytes(o.text) > TEXT_MAX) {
      return { ok: false, error: "too large" };
    }
    frame.text = o.text;
  }
  if (o.kind != null) {
    if (typeof o.kind !== "string" || !KINDS.has(o.kind as FrameKind)) {
      return { ok: false, error: "bad frame" };
    }
    frame.kind = o.kind as FrameKind;
  }
  if (o.user_id != null) {
    if (typeof o.user_id !== "string" || o.user_id.length > 128) {
      return { ok: false, error: "bad frame" };
    }
    frame.user_id = o.user_id;
  }
  const images = parseImages(o.images);
  if (!Array.isArray(images)) {
    return images;
  }
  if (images.length) {
    frame.images = images;
  }
  if (o.context != null) {
    const blob = JSON.stringify(o.context);
    if (utf8Bytes(blob) > CONTEXT_JSON_MAX) {
      return { ok: false, error: "too large" };
    }
    const ctx = parseContext(o.context);
    if (ctx) {
      frame.context = ctx;
    }
  }
  return { ok: true, frame, bytes };
}

export function encodeFrame(frame: WireFrame): string {
  return JSON.stringify(frame);
}

export function hasText(frame: WireFrame): boolean {
  return Boolean(frame.text?.trim());
}

export function hasImages(frame: WireFrame): boolean {
  return Boolean(frame.images?.length);
}

export function hasGeo(frame: WireFrame): boolean {
  return frame.context?.geo != null;
}

/** Bare pin: geo only, no text, no photo. Crane should update here and stay silent. */
export function isBareGeo(frame: WireFrame): boolean {
  return hasGeo(frame) && !hasText(frame) && !hasImages(frame);
}

export function peerOf(role: Role): Role {
  return role === "phone" ? "crane" : "phone";
}
