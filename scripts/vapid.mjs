#!/usr/bin/env node
/**
 * Mint VAPID keys for lock-screen Web Push.
 *
 *   npm run vapid
 *
 * Paste both into Worker secrets (leftover `npm run secrets:push`, or
 * `npx wrangler secret put`). Gantree Settings does not mint these yet.
 */
import { webcrypto } from "node:crypto";

const pair = await webcrypto.subtle.generateKey(
  { name: "ECDSA", namedCurve: "P-256" },
  true,
  ["sign", "verify"],
);
const jwk = await webcrypto.subtle.exportKey("jwk", pair.privateKey);
const raw = new Uint8Array(await webcrypto.subtle.exportKey("raw", pair.publicKey));
let bin = "";
for (const b of raw) {
  bin += String.fromCharCode(b);
}
const publicKey = btoa(bin).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${JSON.stringify(jwk)}`);
