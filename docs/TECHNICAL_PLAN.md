# Neon Snake technical plan

## Trust boundary

The target protocol sends input commands from the browser and keeps movement, orb collection,
score, length, quizzes, hazard activation, collision deaths, and run completion authoritative on
the server. The browser may predict movement for presentation but cannot award gameplay outcomes.

## Target modules

```text
src/shared/             types, configuration, protocol, question schemas
src/server/game/        deterministic simulation and rules
src/server/db/          SQLite setup, migrations, and UTC clock
src/server/repositories persistent weekly leaderboard operations
src/profile/            versioned local browser profile
content/                paraphrased corpus plus draft/approved question banks
scripts/questions/      offline generation, validation, approval, and index tools
```

The top-level `server.ts` will become composition and lifecycle code. Socket handlers will use
runtime schemas and route each player to `chapter:3` through `chapter:10`.

## Delivery sequence

- [x] Establish green typecheck, tests, build, shared types, protocol, and rule constants.
- [x] Build and test the pure authoritative simulation.
- [x] Replace the global world with chapter arenas and typed Socket.IO handlers.
- [x] Replace client snapshots with sequenced input and authoritative snapshots.
- [x] Add editable lobby fields and mobile touch controls. Local profiles, attempts, and rich
  feedback are implemented.
- [x] Connect server-detected self-collision to the persistent weekly leaderboard.
- [x] Add the offline OpenAI generation and human approval workflow.
- [x] Publish the reviewed Chapters 3–10 bank, randomize answer presentation, and add adaptive
  difficulty selection with full-bank no-repeat cycles.
- [x] Show the selected chapter's weekly top ten and locally stored personal best in the lobby,
  including loading and empty states before a player joins an arena.
- [x] Add server-authoritative internal hazards that activate at seven collected orbs, render
  unmistakable warning markers, protect joins and quiz resumes, and report the correct death reason.
- [x] Package one bundled Node replica in a non-root container with a `/data` volume and add a
  repeatable multi-client load smoke.
- [ ] Deploy the image to staging with durable storage and exercise backup/restore there.

## Release gates

- [x] TypeScript, unit, Socket.IO integration, desktop browser, and mobile browser checks pass.
- [x] Payload validation rejects malformed, stale, rate-excessive, and unauthorized commands.
- [x] Chapter rooms are isolated.
- [x] A contested orb has exactly one winner.
- [x] Length never exceeds 100 and quiz penalties never kill.
- [x] Only server-detected self-collision or active-hazard collision finalizes a ranked run.
- [x] Hazard placement, activation, grace periods, spawn clearance, and run reasons are covered by
  deterministic simulation and component tests.
- [x] Question schemas redact answer keys from client runtime payloads.
- [x] Weekly score repository tests cover persistence rules and Monday UTC rollover.
- [x] Production assets contain no OpenAI key or runtime OpenAI dependency path.
- [x] Desktop/mobile browser smoke tests and a 24-client load smoke pass.
