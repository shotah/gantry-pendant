#!/usr/bin/env node
/**
 * Point wrangler.jsonc DIRECTORY at a real KV namespace id (CI / first deploy).
 * Local preview keeps `directory-local`. Production id is vars.DIRECTORY_KV_ID.
 *
 *   DIRECTORY_KV_ID=<32 hex> node scripts/bind-directory.mjs
 *   node scripts/bind-directory.mjs --check
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PLACEHOLDER = "directory-local";
const KV_ID = /^[a-f0-9]{32}$/i;

export function directoryIdOf(src) {
  const m = String(src).match(/"binding":\s*"DIRECTORY"[\s\S]*?"id":\s*"([^"]+)"/);
  return m?.[1] ?? "";
}

export function applyDirectoryId(src, id) {
  const next = String(src).replace(
    /("binding":\s*"DIRECTORY"[\s\S]*?"id":\s*")[^"]+(")/,
    `$1${id}$2`,
  );
  if (next === src) {
    throw new Error("wrangler.jsonc has no DIRECTORY binding id to replace");
  }
  return next;
}

export function assertDeployableDirectoryId(id) {
  const value = String(id ?? "").trim();
  if (!value || value === PLACEHOLDER) {
    throw new Error(
      "DIRECTORY KV id is still the local placeholder. Create a namespace (`npx wrangler kv namespace create DIRECTORY`) and set GitHub variable DIRECTORY_KV_ID (or paste the id into wrangler.jsonc).",
    );
  }
  if (!KV_ID.test(value)) {
    throw new Error(`DIRECTORY KV id looks wrong (${JSON.stringify(value)}); want 32 hex chars`);
  }
  return value;
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
if (invoked && fileURLToPath(import.meta.url) === invoked) {
  const root = resolve(import.meta.dirname, "..");
  const file = resolve(root, "wrangler.jsonc");
  const src = readFileSync(file, "utf8");
  const fromEnv = (process.env.DIRECTORY_KV_ID ?? "").trim();
  const id = assertDeployableDirectoryId(fromEnv || directoryIdOf(src));
  if (process.argv.includes("--check")) {
    console.log("DIRECTORY KV id ok:", id);
    process.exit(0);
  }
  if (directoryIdOf(src) === id) {
    console.log("DIRECTORY KV id already", id);
    process.exit(0);
  }
  writeFileSync(file, applyDirectoryId(src, id));
  console.log("Wrote DIRECTORY KV id into wrangler.jsonc");
}
