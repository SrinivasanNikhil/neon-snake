# Neon Snake

A real-time multiplayer 3D snake game with periodic database-knowledge quizzes. The browser uses React, React Three Fiber, Zustand, and Socket.IO; a Node.js Express/Socket.IO server hosts the app and coordinates shared game state.

## Documentation

- [Architecture](./docs/ARCHITECTURE.md)
- [Product specification](./docs/PRODUCT_SPEC.md)
- [Technical plan and implementation status](./docs/TECHNICAL_PLAN.md)
- [Improvement review and roadmap](./docs/IMPROVEMENTS.md)

## Run locally

Prerequisite: Node.js 22 (the reviewed environment used 22.16.0).

```sh
npm install
npm run dev
```

Open `http://localhost:3000`. Edit the browser-only display name and choose Chapters 3–10 in the
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
suite, client build, and bundled Node server. Socket.IO integration tests require permission to bind a
temporary localhost port in restricted environments.

## Question authoring

The versioned Chapter 3–10 concept corpus lives under `content/corpus`. Generate review drafts with
`npm run questions:generate`, validate with `npm run questions:validate`, and promote an individually
reviewed question with `npm run questions:approve -- ... --confirm-human-review`. Finally run
`npm run questions:index`. The server reads that approved-only index and never reads drafts.

See [the content workflow](./content/README.md) for the required review checklist and options.

## Production shape

`npm run build` creates `dist/` and a standalone `dist-server/server.js`; run it with
`NODE_ENV=production npm start`. `npm run preview` serves only the static Vite client and does not
run multiplayer. The included multi-stage `Dockerfile` runs as a non-root user and mounts SQLite at
`/data`. The supported topology is one authoritative Node.js replica with persistent storage.

For a local realtime smoke, start the server and run `npm run test:load`; client count, duration,
and target URL are configurable through `LOAD_TEST_CLIENTS`, `LOAD_TEST_DURATION_MS`, and
`LOAD_TEST_URL`.
