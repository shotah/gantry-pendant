# Deployment — Cloudflare Worker

Ship **this app** (code) to `workers.dev`. After it is up, who may talk
and how agents get bearers: [setup.md](setup.md).

Pendant is a Cloudflare Worker, not a container. **gantree** and
**ai-gantry** publish images; this repo does not. Wrangler creates the
Worker named `gantry-pendant` on first **code** deploy — do not create
it in the dashboard first.

| Step | Where |
| --- | --- |
| Cloudflare API token + account id + KV namespace | Once, then GitHub (CI **code** deploy) |
| `npm run release` or push `main` | GitHub Actions deploys **code** after tests |
| Google + session + crane bearers | **Gantree Settings → Pendant** + Build. Not GitHub. Not this `.env` |

Local deploy (debug wrangler on this machine): `npm run build && npm run deploy`.
Prefer CI.

`.dev.vars` / `.env` are loopback Worker **app** env (`PENDANT_DEV`,
spike `MAILBOX_SECRET`). They are not a place for the Cloudflare API
token, and they are not the production secret store.

| Thing | Where it lives |
| --- | --- |
| Cloudflare login on this laptop | `npx wrangler login` (OAuth under `~/.config/.wrangler`) |
| CI **code** deploy to Workers | GitHub **secrets** `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` |
| KV namespace id | GitHub **variable** `DIRECTORY_KV_ID` (not a secret; 32 hex) |
| Google / session / crane bearers | Gantree Settings → Pendant (yard sqlite). Leftover: `npm run secrets:push` |

Wrangler may offer to paste the KV id into `wrangler.jsonc`. Decline, or
revert — leave `directory-local` in git. CI injects the real id from the
GitHub variable. `remote: true` on that binding would make local preview
talk to production KV.

---

Wrangler may offer to paste the KV id into `wrangler.jsonc`. Decline, or
revert — leave `directory-local` in git. CI injects the real id from the
GitHub variable. `remote: true` on that binding would make local preview
talk to production KV.

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

Copy the `id` (32 hex characters). That is `DIRECTORY_KV_ID`. If wrangler
asks to add it to `wrangler.jsonc`, say **no** (or revert). Leave
`directory-local` in git — CI injects the real id from the GitHub variable.

### 3. GitHub Actions credentials

This repo → **Settings → Secrets and variables → Actions**.

**Secrets:**

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

**Variables** (not a secret):

- `DIRECTORY_KV_ID` — the 32-hex id from step 2

Do **not** put `GOOGLE_*`, `SESSION_SECRET`, or `CRANE_BEARERS` here.
Those stay on the Worker, pushed from **Gantree**. CI never sees them.

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

## After the Worker exists — Gantree, not this `.env`

### 5. Worker secrets (Google, session, agents)

**Gantree Settings → Pendant** (admin): Cloudflare API token with Edit
Cloudflare Workers (can be a **second** token from the CI one, or the
same template), account id, Worker name (`gantry-pendant`), origin,
Google Web client. Save and push.

**Gantree Build** (channel pendant): mints `CRANE_BEARERS` for that
slug, writes crane `.env`. Recreate. Rotate from the crane’s Pendant
fold.

Walk: [setup.md](setup.md). Gantree
[manage_pendant_cf_todo.md](https://github.com/shotah/gantree/blob/main/docs/manage_pendant_cf_todo.md).

```bash
# Leftover — loopback without a yard, or break-glass.
# Do not mix with Gantree after the yard owns CRANE_BEARERS.
# cp .env.example .env
# npm run secret
# npm run secrets:push:dry
# npm run secrets:push
```

`MAILBOX_SECRET` and `PENDANT_DEV` stay in `.env` / `.dev.vars` for
loopback. Never put them on `workers.dev`.

### 6. Google OAuth client

A **new Web application** client (the google-mcp Desktop client is the
wrong one). Scopes: `openid email profile` only. Redirect:

```text
https://gantry-pendant.<account>.workers.dev/api/auth/callback/google
```

Not `oauth-catch`, not `localhost:4100`. Paste id/secret in Gantree
Settings (it shows this URI after origin is saved).

### 7. Point a crane at it

Gantree Build → channel **pendant** → tick humans → recreate. No bearer
paste. [setup.md](setup.md).

---

## Later deploys

Skip 1–3. Skip 5–6 unless rotating Google or the origin.

```bash
npm run release
```

Or merge to `main`. Either one deploys **code** after tests. Worker
secrets stay put (Gantree / Cloudflare), not overwritten by CI.

Rotate a bearer: Gantree → Kit → Pendant fold → Rotate bearer, then
recreate. Leftover: `npm run secrets:push` from this `.env` (can drop
other slugs the yard minted).

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
| Site is `503 config` | Step 5 incomplete (Gantree Settings not pushed). Code deploy is fine. |
| Google redirect mismatch | Step 6 URI is not this origin. |
| Green deploy, empty crane list on the phone | Not a deploy miss — crane `PENDANT_ALLOWED_USERS` + recreate. [setup.md](setup.md). |

Local wrangler (login on this machine, not the GitHub token):

```bash
DIRECTORY_KV_ID=<32 hex> node scripts/bind-directory.mjs
npm run build && npm run deploy -- --skip-build
```
