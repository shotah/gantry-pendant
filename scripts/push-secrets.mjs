#!/usr/bin/env node
/**
 * Leftover: push Worker secrets from .env via wrangler.
 *
 * Production path is Gantree Settings → Pendant (and Build mint).
 * Do not use this after the yard owns Google / SESSION_SECRET /
 * CRANE_BEARERS — a bulk put here can drop slugs the yard minted.
 *
 * Still useful for loopback without a yard, or break-glass.
 *
 *   npm run secrets:push
 *   npm run secrets:push -- --dry-run
 *   npm run secrets:push -- --file=.env
 */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOW = new Set([
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "SESSION_SECRET",
  "ALLOWED_SUBS",
  "CRANE_BEARERS",
  "VAPID_PUBLIC_KEY",
  "VAPID_PRIVATE_KEY",
  "VAPID_SUBJECT",
]);

const DENY = new Set(["MAILBOX_SECRET", "PENDANT_DEV", "DIRECTORY_KV_ID"]);
const BEARER_PREFIX = "CRANE_BEARER_";

export function parseEnv(src) {
  const out = {};
  for (const rawLine of String(src).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const stripped = line.startsWith("export ") ? line.slice(7).trim() : line;
    const eq = stripped.indexOf("=");
    if (eq < 1) {
      continue;
    }
    const key = stripped.slice(0, eq).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      continue;
    }
    let value = stripped.slice(eq + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"") && value.length >= 2)
      || (value.startsWith("'") && value.endsWith("'") && value.length >= 2)
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function parseBearers(raw) {
  const map = new Map();
  if (!String(raw ?? "").trim()) {
    return map;
  }
  for (const part of String(raw).split(",")) {
    const bit = part.trim();
    const colon = bit.indexOf(":");
    if (colon < 1) {
      continue;
    }
    const slug = bit.slice(0, colon).trim().toLowerCase();
    const token = bit.slice(colon + 1);
    if (slug && token) {
      map.set(slug, token);
    }
  }
  return map;
}

export function joinBearers(map) {
  return [...map.entries()]
    .filter(([slug, token]) => slug && token)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([slug, token]) => `${slug}:${token}`)
    .join(",");
}

function isDenied(key) {
  return DENY.has(key) || key.startsWith("CLOUDFLARE_");
}

export function collectSecrets(env) {
  const skipped = [];
  const secrets = {};
  const bearers = parseBearers(env.CRANE_BEARERS);

  for (const [key, raw] of Object.entries(env)) {
    const value = String(raw ?? "").trim();
    if (key === "CRANE_BEARERS") {
      continue;
    }
    if (key.startsWith(BEARER_PREFIX)) {
      const slug = key.slice(BEARER_PREFIX.length).trim().toLowerCase();
      if (!slug || !value) {
        skipped.push(key);
        continue;
      }
      bearers.set(slug, value);
      continue;
    }
    if (isDenied(key)) {
      if (value) {
        skipped.push(key);
      }
      continue;
    }
    if (!ALLOW.has(key)) {
      continue;
    }
    if (!value) {
      skipped.push(key);
      continue;
    }
    secrets[key] = value;
  }

  const joined = joinBearers(bearers);
  if (joined) {
    secrets.CRANE_BEARERS = joined;
  }
  return { secrets, skipped };
}

export function parseCli(argv) {
  const out = { dryRun: false, file: ".env", help: false };
  for (const a of argv) {
    if (a === "--dry-run") {
      out.dryRun = true;
    } else if (a === "--help" || a === "-h") {
      out.help = true;
    } else if (a.startsWith("--file=")) {
      out.file = a.slice("--file=".length).trim() || ".env";
    } else {
      throw new Error(`unknown arg ${a}`);
    }
  }
  return out;
}

function pushWithWrangler(root, secrets) {
  const wrangler = resolve(root, "node_modules/wrangler/bin/wrangler.js");
  const r = spawnSync(process.execPath, [wrangler, "secret", "bulk"], {
    cwd: root,
    input: JSON.stringify(secrets),
    encoding: "utf8",
    stdio: ["pipe", "inherit", "inherit"],
  });
  if (r.status !== 0) {
    throw new Error(`wrangler secret bulk failed (exit ${r.status ?? "null"})`);
  }
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
if (invoked && fileURLToPath(import.meta.url) === invoked) {
  const args = parseCli(process.argv.slice(2));
  if (args.help) {
    console.log(`npm run secrets:push [-- --dry-run] [-- --file=.env]

Leftover. Worker secrets (Google, session, CRANE_BEARERS) belong in
Gantree Settings → Pendant. This bulk-puts from .env for loopback
or break-glass only.`);
    process.exit(0);
  }

  const root = resolve(import.meta.dirname, "..");
  const file = resolve(root, args.file);
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    throw new Error(`missing ${args.file} — copy .env.example and fill Worker secrets`);
  }

  const { secrets, skipped } = collectSecrets(parseEnv(src));
  const keys = Object.keys(secrets).sort();
  if (keys.length === 0) {
    throw new Error(`no Worker secrets in ${args.file} — fill GOOGLE_*, SESSION_SECRET, CRANE_BEARER_<slug>`);
  }

  const denied = skipped.filter((k) => isDenied(k) || k.startsWith(BEARER_PREFIX));
  if (denied.length) {
    console.log("Not pushing:", [...new Set(denied)].join(", "));
  }
  if (!secrets.SESSION_SECRET || !secrets.CRANE_BEARERS) {
    console.log("Warning: Worker needs SESSION_SECRET and CRANE_BEARERS or it stays 503 config.");
  }

  if (args.dryRun) {
    console.log("Would put:", keys.join(", "));
    process.exit(0);
  }

  console.warn(
    "Leftover path: Gantree Settings → Pendant owns Worker secrets. A bulk put from this .env can drop yard-minted CRANE_BEARERS slugs.",
  );
  console.log("Putting:", keys.join(", "));
  pushWithWrangler(root, secrets);
  console.log("Worker secrets updated.");
}
