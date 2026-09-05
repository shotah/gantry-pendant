/** Raster of `public/icon.svg` for Chrome's 192 / 512 PNG install rule. */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type PendantIconKind = "any" | "maskable" | "apple";

const PNG_SIG = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

const CANVAS = { r: 12, g: 10, b: 9, a: 255 };
const GOLD = { r: 232, g: 184, b: 109, a: 255 };
const DARK = { r: 28, g: 25, b: 23, a: 255 };
const DOT = { r: 110, g: 231, b: 183, a: 255 };
const CLEAR = { r: 0, g: 0, b: 0, a: 0 };

type Rgba = { r: number; g: number; b: number; a: number };

export const PWA_ICON_FILES = {
  "icon-192.png": () => pendantPng(192, "any"),
  "icon-512.png": () => pendantPng(512, "any"),
  "icon-maskable-512.png": () => pendantPng(512, "maskable"),
  "apple-touch-icon.png": () => pendantPng(180, "apple"),
} as const;

export function writePendantIcons(dir: string): string[] {
  mkdirSync(dir, { recursive: true });
  const names = Object.keys(PWA_ICON_FILES) as (keyof typeof PWA_ICON_FILES)[];
  for (const name of names) {
    writeFileSync(join(dir, name), PWA_ICON_FILES[name]());
  }
  return [...names];
}

export function pngSize(bytes: Uint8Array): { width: number; height: number } | null {
  if (bytes.length < 24 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) {
    return null;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

export function pendantPng(size: number, kind: PendantIconKind = "any"): Uint8Array {
  if (!Number.isInteger(size) || size < 16) {
    throw new Error("icon size");
  }
  const rgba = new Uint8Array(size * size * 4);
  const samples = [0.25, 0.75];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (const ox of samples) {
        for (const oy of samples) {
          const c = sample(x + ox, y + oy, size, kind);
          r += c.r;
          g += c.g;
          b += c.b;
          a += c.a;
        }
      }
      const i = (y * size + x) * 4;
      rgba[i] = Math.round(r / 4);
      rgba[i + 1] = Math.round(g / 4);
      rgba[i + 2] = Math.round(b / 4);
      rgba[i + 3] = Math.round(a / 4);
    }
  }
  return encodePng(size, size, rgba);
}

function sample(px: number, py: number, size: number, kind: PendantIconKind): Rgba {
  const pad = kind === "maskable" ? size * 0.1 : 0;
  const inner = size - 2 * pad;
  const u = ((px - pad) / inner) * 64;
  const v = ((py - pad) / inner) * 64;
  const opaque = kind !== "any";
  if (u < 0 || v < 0 || u > 64 || v > 64) {
    return opaque ? CANVAS : CLEAR;
  }
  let out: Rgba = opaque ? CANVAS : CLEAR;
  if (inRoundRect(u, v, 0, 0, 64, 64, 16)) {
    out = CANVAS;
  }
  if (inRoundRect(u, v, 22, 8, 20, 8, 3) || inPendantBody(u, v)) {
    out = GOLD;
  }
  if (inCircle(u, v, 32, 34, 7)) {
    out = DARK;
  }
  if (inCircle(u, v, 32, 34, 3)) {
    out = DOT;
  }
  return out;
}

function inPendantBody(x: number, y: number): boolean {
  return inRect(x, y, 20, 18, 24, 28) || (y >= 46 && inCircle(x, y, 32, 46, 12));
}

function inRect(x: number, y: number, rx: number, ry: number, w: number, h: number): boolean {
  return x >= rx && y >= ry && x <= rx + w && y <= ry + h;
}

function inCircle(x: number, y: number, cx: number, cy: number, r: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function inRoundRect(x: number, y: number, rx: number, ry: number, w: number, h: number, r: number): boolean {
  if (!inRect(x, y, rx, ry, w, h)) {
    return false;
  }
  const rr = Math.min(r, w / 2, h / 2);
  if (x >= rx + rr && x <= rx + w - rr) {
    return true;
  }
  if (y >= ry + rr && y <= ry + h - rr) {
    return true;
  }
  const cx = x < rx + rr ? rx + rr : rx + w - rr;
  const cy = y < ry + rr ? ry + rr : ry + h - rr;
  return inCircle(x, y, cx, cy, rr);
}

function encodePng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (stride + 1);
    raw[row] = 0;
    raw.set(rgba.subarray(y * stride, y * stride + stride), row + 1);
  }
  const ihdr = concat(u32(width), u32(height), Uint8Array.of(8, 6, 0, 0, 0));
  return concat(PNG_SIG, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", new Uint8Array()));
}

function u32(n: number): Uint8Array {
  const b = new Uint8Array(4);
  new DataView(b.buffer).setUint32(0, n);
  return b;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const crcInput = concat(typeBytes, data);
  return concat(u32(data.length), crcInput, u32(crc32(crcInput)));
}
