/** Wire limits. Photos are the quota bomb; text stays small. */

export const TEXT_MAX = 8_000;
export const CONTEXT_JSON_MAX = 2_048;
export const IMAGE_MAX = 1;
export const IMAGE_BYTES_MAX = 1_500_000;
export const FRAME_BYTES_MAX = 2_000_000;
export const QUEUE_MAX = 50;
/** Total queued bytes per destination key `(to, userId||"")`. */
export const QUEUE_BYTES_MAX = 8 * 1024 * 1024;
export const QUEUE_TTL_MS = 60 * 60 * 1000;
export const RATE_FRAMES_PER_MIN = 30;
export const RATE_BYTES_PER_MIN = 256_000;

export function utf8Bytes(s: string): number {
  return new TextEncoder().encode(s).byteLength;
}

/** True when Content-Length is present and over the cap. Missing length is not a pass. */
export function headerSaysTooLarge(contentLength: string | null | undefined, max: number): boolean {
  const n = Number(contentLength ?? "NaN");
  return Number.isFinite(n) && n > max;
}
