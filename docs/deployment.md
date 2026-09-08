# Deployment — Cloudflare Worker

Ship this app to `workers.dev`. After it is up, who may talk:
[setup.md](setup.md).

Pendant is a Cloudflare Worker, not a container. **gantree** and
**ai-gantry** publish images; this repo does not. Wrangler creates the
Worker named `gantry-pendant` on first deploy — do not create it in the
dashboard first.

| Step | Where |
| --- | --- |
| Cloudflare API token + account id + KV namespace | Once, then GitHub |
| `npm run release` or push `main` | GitHub Actions deploys after tests |
| Google + session + crane bearers | Worker secrets on Cloudflare, not GitHub |

Local deploy (debug wrangler on this machine): `npm run build && npm run deploy`.
Prefer CI.

---

## Once — Cloudflare, then GitHub, then ship

Stop when the origin answers (even if it is `503 config` — that is
step 5).

### 1. Cloudflare account

1. Dashboard → **Workers & Pages** → copy **Account ID** (right rail).
2. Profile (top right) → **API Tokens** → **Create Token** → use the
   **Edit Cloudflare Workers** template → copy the token **once**.

Do not click **Create Worker**.

### 2. One KV namespace

```bash
npx wrangler login
npx wrangler kv namespace create DIRECTORY
```

Copy the `id` (32 hex characters). That is `DIRECTORY_KV_ID`. Leave
`wrangler.jsonc` on `directory-local` in git — CI injects the real id.

### 3. GitHub Actions credentials

This repo → **Settings → Secrets and variables → Actions**.

**Secrets:**

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

**Variables** (not a secret):

- `DIRECTORY_KV_ID` — the 32-hex id from step 2

Do **not** put `GOOGLE_*`, `SESSION_SECRET`, or `CRANE_BEARERS` here.
Those stay on the Worker. CI never sees them.

### 4. Deploy

Push to `main`, or cut a versioned release (same pattern as gantree):

```bash
npm run release:dry          # prints the next tag
npm run release              # patch: commit, tag v*, push
# npm run release -- --bump=minor
```

That pushes `HEAD`, the `v*` tag, and floating `latest`. Then:

- **ci.yml** — tests, then deploys the Worker (`main` or a non-prerelease `v*` tag).
- **release.yml** — GitHub Release notes for the tag.

To deploy `main` without a new tag: **Actions → ci → Run workflow**.

Origin:

```text
https://gantry-pendant.<account>.workers.dev
```

First deploy with no Worker secrets is `503 config`. That is expected.
Do not set `MAILBOX_SECRET` or `PENDANT_DEV` on this Worker.

---

## After the Worker exists — not GitHub

### 5. Worker secrets (Cloudflare)

Same checkout, wrangler already logged in:

```bash
npm run secret                               # mint SESSION_SECRET
npm run secret                               # mint a crane bearer
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put SESSION_SECRET
npx wrangler secret put CRANE_BEARERS        # kit:<that-bearer>
```

`CRANE_BEARERS` is `slug:token`. One crane cannot use another's token.
Optional yard-wide extra: `npx wrangler secret put ALLOWED_SUBS`. The
crane list is the door — this is break-glass only.

### 6. Google OAuth client

A **new Web application** client (the google-mcp Desktop client is the
wrong one). Scopes: `openid email profile` only. Redirect:

```text
https://gantry-pendant.<account>.workers.dev/api/auth/callback/google
```

Not `oauth-catch`, not `localhost:4100`. Re-put `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` if the client was created after step 5.

### 7. Point a crane at it

Mailbox URL, same bearer, human list, **recreate** (not restart). Walk:
[setup.md](setup.md). Gantree does not write Worker secrets.

---

## Later deploys

Skip 1–3. Skip 5–6 unless rotating a secret or the OAuth client.

```bash
npm run release
```

Or merge to `main`. Either one deploys after tests.

Rotate a bearer: `wrangler secret put CRANE_BEARERS`, put the same
token on the crane as `PENDANT_BEARER`, recreate.

---

## Sibling repos

| Repo | Command | Lands on |
| --- | --- | --- |
| **gantry-pendant** (this) | `npm run release` | Cloudflare Worker `gantry-pendant` |
| **gantree** | `npm run release` | Docker Hub / GHCR `shotah/gantree` |
| **ai-gantry** | `make release` | Docker Hub / GHCR `shotah/ai-gantry` + GitHub binaries |

Phone chat is this Worker plus a crane with `CHANNEL=pendant`.

---

## If CI fails

| Symptom | Usual cause |
| --- | --- |
| Workers job: “Set repo secrets CLOUDFLARE_…” | Step 3 missing. Re-run CI after paste. |
| Workers job: DIRECTORY KV id is still the placeholder | GitHub **variable** `DIRECTORY_KV_ID` missing or not 32 hex. |
| Site is `503 config` | Step 5 incomplete. Code deploy is fine. |
| Google redirect mismatch | Step 6 URI is not this origin. |
| Green deploy, empty crane list on the phone | Not a deploy miss — crane `PENDANT_ALLOWED_USERS` + recreate. [setup.md](setup.md). |

Local wrangler (login on this machine, not the GitHub token):

```bash
DIRECTORY_KV_ID=<32 hex> node scripts/bind-directory.mjs
npm run build && npm run deploy -- --skip-build
```
