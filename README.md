# Neon Snake

A real-time multiplayer 3D snake game with periodic database-knowledge quizzes. The browser uses React, React Three Fiber, Zustand, and native WebSockets; a Cloudflare Worker and SQLite-backed Durable Object coordinate authoritative shared game state.

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Product specification](./docs/PRODUCT_SPEC.md)
- [Technical plan and implementation status](./docs/TECHNICAL_PLAN.md)
- [Improvement review and roadmap](./docs/IMPROVEMENTS.md)
- [Cloudflare free-tier deployment](./docs/CLOUDFLARE_DEPLOYMENT.md)

## Run locally

Prerequisite: Node.js 22 (the reviewed environment used 22.16.0).

```sh
npm install
npm run dev
```

The command builds the browser application and prints a local Wrangler URL, normally
`http://localhost:8787`. Open it, enter a browser-only display name, and choose Chapters 3–10 in the
lobby. The deployed game makes no AI calls; `OPENAI_API_KEY` is used only by the offline authoring
command and must never be exposed through Vite.

## Quality checks

```sh
npm run lint
npm run test
npm run build
npm run check
npm run questions:validate
```

`npm run lint` aliases TypeScript checking. `npm run check` runs typecheck, the full unit/integration
suite, client build, Cloudflare runtime tests, and a Wrangler deployment dry-run. The retained legacy
Socket.IO integration tests require permission to bind a temporary localhost port in restricted
environments.

## Question authoring

The versioned Chapter 3–10 concept corpus lives under `content/corpus`. Generate review drafts with
`npm run questions:generate`, validate with `npm run questions:validate`, and promote an individually
reviewed question with `npm run questions:approve -- ... --confirm-human-review`. Finally run
`npm run questions:index`. The server reads that approved-only index and never reads drafts.

See [the content workflow](./content/README.md) for the required review checklist and options.

## Production shape

`npm run build` creates the Vite assets and validates the Cloudflare Worker bundle without
deploying it. `npm run deploy` publishes the Worker after Wrangler login. One globally named
Durable Object owns the chapter arenas and stores weekly best scores in its SQLite storage; static
assets and `/api/*` are served from the same `workers.dev` origin.

The old Node server, container, and Socket.IO tests remain temporarily as migration references, but
they are no longer the supported browser runtime. See the [Cloudflare deployment guide](./docs/CLOUDFLARE_DEPLOYMENT.md)
for first deployment, GitHub integration, limits, rollback, and smoke testing.
