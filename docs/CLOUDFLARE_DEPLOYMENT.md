# Cloudflare Free-Tier Deployment

Neon Snake can run as one Cloudflare Worker with static frontend assets and one
SQLite-backed Durable Object class. A single stable `NeonSnakeClassroom`
instance owns the chapter arenas, authoritative game state, and leaderboards.
This keeps classroom-wide state ordered and avoids keeping multiple objects
active on the free tier.

```text
Browser ── /assets/* ──> Cloudflare Static Assets
   │
   └── WebSocket /api/realtime
                         │
                         └── Global NeonSnakeClassroom Durable Object
                             ├── chapter arenas and simulation
                             ├── quiz and hazard state
                             └── SQLite leaderboard
```

The Worker entry point is `src/cloudflare/worker.ts`. The deployment settings
are in `wrangler.jsonc`:

- `ASSETS` serves the Vite build from `dist` and falls back to `index.html` for
  client-side routes.
- `/api/*` runs through the Worker before static-asset handling. This is
  required for the `/api/realtime` WebSocket upgrade and health endpoints.
- `CLASSROOM` binds to the `NeonSnakeClassroom` Durable Object class.
- Migration `v1` provisions the class with SQLite storage, the storage backend
  supported by the Workers Free plan.
- `workers_dev` provides a public `*.workers.dev` address without buying a
  domain.

## Local verification

Use Node.js 22 or later. Install dependencies and run the complete check before
starting the Worker locally:

```bash
npm ci
npm run check
npx wrangler dev
```

`wrangler.jsonc` declares an empty required-secret allowlist, so Wrangler does not expose values from
`.env.local` to the Worker. The file contains the authoring-only OpenAI key and must never be loaded
into the game runtime. If a Worker secret is introduced later, add its name to that explicit list and
put the local value in an ignored `.dev.vars` file.

Open the local URL printed by Wrangler. Test at least two browser windows in the
same chapter, a quiz, self-collision, a hazard collision, reconnecting, and the
weekly leaderboard. A useful health check is:

```bash
curl http://localhost:8787/api/health
```

Local Durable Object data is stored under `.wrangler/` and is intentionally
ignored by Git. Use `npx wrangler dev --remote` only when deliberately testing
against Cloudflare-managed development resources.

## First deployment from a computer

1. Create a free Cloudflare account and enable the `workers.dev` subdomain when
   prompted.
2. Run `npx wrangler login` and approve the browser authorization.
3. Run `npm run check`.
4. Run `npm run deploy`.
5. Open the `workers.dev` URL printed by Wrangler and repeat the multiplayer
   smoke test.

The first deploy applies the Durable Object `v1` migration automatically. Do
not change or remove that migration after production data exists. Any future
class rename or deletion needs a new, reviewed migration tag.

## Automatic deployment from GitHub

Cloudflare Workers Builds is the simplest path because Cloudflare manages the
deployment credential:

1. In the Cloudflare dashboard, open **Workers & Pages** and choose **Create
   application**.
2. Choose **Import a repository**, connect GitHub, and grant access only to
   `SrinivasanNikhil/neon-snake` where GitHub offers that choice.
3. Select the `main` branch. The Worker/project name must be `neon-snake` to
   match `wrangler.jsonc`.
4. Use `npm ci && npm run check` as the build command.
5. Use `npx wrangler deploy` as the deploy command.
6. Leave the root directory at the repository root and select **Save and
   Deploy**.

Each push to `main` will then build and deploy. Pull-request branches can upload
versions, but Cloudflare does not provide preview URLs for Workers that use
Durable Objects. Keep the existing GitHub test workflow as a required check
before merging.

An alternative is GitHub Actions with the official Wrangler action. That path
requires repository secrets named `CLOUDFLARE_API_TOKEN` and
`CLOUDFLARE_ACCOUNT_ID`; use a token scoped to Workers Scripts edit access for
only the intended Cloudflare account. Never commit either value.

## Secrets and configuration

The deployed game does not call OpenAI. Do **not** add `OPENAI_API_KEY` to
Cloudflare, GitHub Actions, `wrangler.jsonc`, or any `VITE_*` variable. The key
is used only by the offline, reviewed question-authoring scripts. Approved
question content is bundled into the Worker during the build.

Likewise, do not copy `.env.local` to Cloudflare. Local Worker-only secrets, if
ever introduced, belong in `.dev.vars`; production secrets belong in
Cloudflare's encrypted secrets store. `.dev.vars` and `.env.local` are both
ignored by Git, while their `.example` templates are safe to commit.

## Free-tier operating envelope

Cloudflare currently makes Durable Objects available on the Workers Free plan
only with the SQLite backend. The free allocation includes 100,000 Durable
Object requests and 13,000 GB-seconds of duration per day, and 5 GB of SQLite
storage per account. If any daily free allocation is exhausted, that operation
fails until the allocation resets at 00:00 UTC; there is no automatic free-tier
overage charge.

The connection upgrade and incoming client messages count toward Durable Object requests; Cloudflare
currently bills incoming WebSocket messages at a 20-to-1 ratio and does not request-bill outgoing
WebSocket messages. The browser therefore sends input only when a control changes, not every render
frame. The simulation keeps the global classroom object active while students are playing and stops
its fixed-step loop as soon as the last active run disconnects or ends. Multiple active chapters
share this one object, so they increase its processing work without multiplying the number of active
objects. For classroom use:

- keep the transition-only client input behavior covered by tests and review any future heartbeat
  before release;
- keep the server's 20-input-transitions-per-second ceiling; clients that exceed it are disconnected
  to limit sustained misuse;
- monitor usage in **Workers & Pages > Observability** during the first class;
- test the expected number of simultaneous students before relying on the free
  tier for an assessed activity;
- close idle game tabs so empty chapter rooms can stop promptly; and
- treat a limit-exceeded response as a service interruption until the daily
  reset, not as lost leaderboard data.

Current limits should be checked before each semester because Cloudflare can
change plan allowances. See the official [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)
and [limits](https://developers.cloudflare.com/durable-objects/platform/limits/)
pages.

## Rollback and recovery

Before a production deploy, record the currently active version in the
Cloudflare dashboard. If a new release fails its smoke test, use **Workers &
Pages > neon-snake > Deployments** to roll traffic back to the last known-good
Worker version, or use Wrangler's rollback command shown for that deployment.

A code rollback does not reverse Durable Object data or schema changes. Keep
schema updates backward-compatible, introduce them in a new migration, and
back up important classroom results before a destructive data change.
SQLite-backed Durable Objects support point-in-time recovery, but restoration
is a separate storage operation and should be rehearsed before it is needed.

After rollback, verify `/api/health`, open two clients in one chapter, and check
that existing leaderboard rows remain visible.

## Official references

- [Wrangler configuration](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Static assets routing](https://developers.cloudflare.com/workers/static-assets/)
- [Durable Object migrations](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/)
- [Workers Builds Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/)
- [Workers Builds configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [GitHub Actions deployment](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
