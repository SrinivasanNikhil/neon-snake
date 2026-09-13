# Neon Snake architecture

This document describes the implementation after the authoritative multiplayer cutover.
Remaining product work is tracked in [TECHNICAL_PLAN.md](./TECHNICAL_PLAN.md).

## System overview

Neon Snake is a chapter-based multiplayer game hosted by one Node.js process. The browser
sends sequenced steering input and renders authoritative snapshots. The server owns movement,
orb collection, score, length, quiz milestones, quiz effects, internal hazards, collision deaths,
and run completion.

```mermaid
flowchart LR
    Browser["React browser client"] -->|"join, input, answer, continue"| Socket["Socket.IO server"]
    Socket --> Rooms["Chapter 3-10 arenas"]
    Rooms --> Simulation["60 Hz authoritative simulation"]
    Simulation -->|"20 Hz chapter snapshots"| Browser
    Simulation --> Quiz["Server-owned quiz attempts"]
    Simulation --> Leaderboard["SQLite weekly leaderboards"]
    Browser --> Profile["Versioned local profile"]
```

The deployed game does not call OpenAI. A future offline authoring command will use
`OPENAI_API_KEY` to create review drafts; only approved question files may enter runtime.

## Runtime ownership

### Browser

- Stores the anonymous profile, display name, preferred chapter, mastery, streaks, and local
  statistics in versioned `localStorage`.
- Sends `join`, sequenced `input`, `submit_answer`, and `continue_after_quiz` commands.
- Requests the selected chapter leaderboard before joining so the lobby can show weekly scores
  alongside the locally stored personal best.
- Receives chapter-scoped snapshots and interpolates snake positions for rendering.
- Updates local learning progress only from server quiz and run results.
- Never reports positions, scores, pickups, quiz eligibility, or death.

### Server

- Maintains one in-memory arena for each occupied chapter.
- Simulates movement at 60 Hz and broadcasts snapshots at 20 Hz.
- Resolves contested orb pickups once and triggers a quiz every ten confirmed pickups.
- Starts from the client's coarse mastery band, adapts difficulty from validated answers, avoids
  repeats until the chapter bank is cycled, and shuffles answer presentation per attempt.
- Caps body length at 100 while allowing score to continue.
- Ignores collisions with other snakes and treats walls as non-lethal boundaries.
- Activates deterministic chapter hazards arena-wide when a player reaches seven collected orbs,
  while enforcing activation, join, and post-quiz grace periods.
- Detects self-collision at 15 or more segments and head collisions with active internal hazards,
  then finalizes the run exactly once.
- Validates and rate-limits Socket.IO payloads.
- Stores only weekly best scores in SQLite after a server-detected gameplay death.

## Repository map

| Path | Responsibility |
| --- | --- |
| `server.ts` | HTTP/Socket.IO composition, SQLite, health endpoints, lifecycle, and static/Vite serving. |
| `src/server/arena/ArenaManager.ts` | Chapter-room state, joins, input routing, snapshots, quiz attempts, and tick outcomes. |
| `src/server/game/` | Pure movement, collision, scoring, and simulation rules. |
| `src/server/socket/` | Validated realtime handlers, rate limits, game loop, and integration tests. |
| `src/server/db/` | SQLite configuration, migrations, and weekly UTC clock. |
| `src/server/repositories/` | Hashed anonymous weekly-score persistence and ranking. |
| `src/server/questions/` | Approved-bank loading, adaptive selection, no-repeat tracking, answer shuffling, and grading. |
| `src/shared/protocol.ts` | Typed client/server events and sanitized payloads. |
| `src/shared/questionSchema.ts` | Versioned approved/draft question contract and answer redaction. |
| `src/profile/` | Local profile parsing, migration, persistence, and progress updates. |
| `src/store/gameStore.ts` | Typed Socket.IO client, authoritative snapshots, profile updates, and quiz UI state. |
| `src/components/GameScene.tsx` | Input capture, snapshot interpolation, camera, and Three.js rendering. |
| `src/components/UI.tsx` | Join/death overlay, HUD, weekly leaderboard, and explicit quiz feedback. |

## Realtime protocol

| Direction | Event | Authority |
| --- | --- | --- |
| Client → server | `join` | Validated UUID, sanitized name, and Chapter 3–10 selection. |
| Client → server | `request_leaderboard` | Validated Chapter 3–10 request; allowed before joining. |
| Client → server | `input` | Increasing sequence and three boolean controls only. |
| Client → server | `submit_answer` | Must match the server-issued active attempt. |
| Client → server | `continue_after_quiz` | Accepted only after an answer has been scored. |
| Server → client | `init` | Identifies the player and joined chapter. |
| Server → room | `snapshot` | Sanitized authoritative players, orbs, hazard state, and hazard locations for one chapter. |
| Server → client | `trigger_quiz` | Contains no answer or feedback fields. |
| Server → client | `quiz_result` | Answer, explanation, source, and applied deltas. |
| Server → client | `run_ended` | Server-validated self-collision or hazard-collision summary. |
| Server → room | `leaderboard` | Weekly chapter top ten. |

The removed legacy events `update_state` and `collect_orb` have no server handlers.

## Persistence and privacy

SQLite uses WAL mode, a five-second busy timeout, transactional migrations, and one row per
week/chapter/profile hash. Monday 00:00 UTC starts a new leaderboard week. A lower score cannot
replace an existing weekly best. Disconnects abandon runs and do not write leaderboard rows.

The raw browser UUID and learning history are not stored in the database. With no authentication,
a copied UUID can still impersonate a browser identity; this limitation is explicit.

## Configuration and health

Runtime configuration uses `HOST`, `PORT`, `ALLOWED_ORIGINS`, and `DATABASE_PATH`. Production
CORS uses the configured origin list. Socket.IO payloads are capped at 16 KiB.

- `GET /api/health/live`: process liveness.
- `GET /api/health/ready`: migrations/database ready and shutdown not started.
- `GET /api/health`: compatibility status.

`SIGTERM` and `SIGINT` stop game intervals, close Socket.IO/HTTP, and close SQLite.

## Current limitations

- Adaptive difficulty uses five coarse mastery bands and one-step correct/incorrect adjustments;
  it is intentionally simpler than a calibrated assessment model.
- Local movement prediction is not implemented; rendering interpolates server snapshots.
- Snapshots still contain the complete chapter arena; delta replication is deferred.
- The production process remains intentionally single-replica because arena simulation is local.
- The container definition is present, but its image still needs staging verification with a
  durable volume and backup/restore exercise.
- The client bundle still triggers Vite's 500 KiB chunk warning.
