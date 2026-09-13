# Neon Snake product specification

## Purpose

Neon Snake is a deployed, chapter-based learning game and companion to Richard T. Watson's
open *Data Management* book. Players choose one chapter from 3 through 10, join that chapter's
public multiplayer arena, collect orbs, and answer database questions.

## Player experience

- A player supplies a display name and selects exactly one chapter.
- Before play, the lobby shows the selected chapter's weekly top ten, an explicit empty state,
  and the player's locally stored personal best for that chapter.
- The browser remembers the anonymous profile, preferences, games, high scores, mastery,
  streaks, and achievements without an account.
- Every ten server-confirmed orb pickups opens a protected, untimed multiple-choice quiz.
- Correct answers award 10 points and a five-second speed boost.
- Incorrect answers deduct up to five points and five segments and apply a three-second
  slowdown. A quiz penalty never kills the snake.
- Quiz feedback shows the answer, an explanation, a review concept, and a link to the relevant
  book section. The player explicitly continues after reading it.
- The browser converts local chapter mastery into a coarse starting difficulty from 1 through 5.
  The server then adjusts the target difficulty after each validated answer and selects the
  nearest available question without repeating one until the chapter bank has been cycled.
- Answer choices are shuffled independently for every server-issued attempt. Stable internal
  option identifiers keep grading correct regardless of displayed A–D position.
- When the first player in a chapter arena collects seven orbs, three chapter-specific internal
  hazards deploy for everyone. The HUD warns players before activation, and the arena provides a
  two-second grace period before the hazards become lethal.

## Snake rules

- Length starts at 10 and is capped at 100; score can continue above 100.
- Snakes pass through other snakes and cannot eat them.
- Walls stop or slide the snake safely.
- Self-collision becomes active at 15 segments.
- Touching an active internal hazard with the snake's head ends the run. Hazard locations are
  deterministic, marked by pulsing warning rings, triangular pylons, and exclamation symbols,
  and kept clear of player and orb spawn points.
- Joining an arena or continuing after a protected quiz grants two seconds of hazard protection.
- Death and disconnects do not create orbs.
- A server-detected self-collision or hazard collision ends and ranks the run; a disconnect
  abandons the ranked run.

## Questions and AI

- Runtime content is limited to Chapters 3 through 10 and is selected for the player's room.
- Launch questions are multiple choice and may cover SQL, data modeling, normalization, and
  other concepts appropriate to the selected chapter.
- Source material is paraphrased and attributed rather than copied into the repository.
- OpenAI assists an offline authoring workflow. Generated drafts require human review and
  approval before entering the runtime bank.
- The launch bank contains 160 reviewed questions across Chapters 3 through 10.
- The production game makes no AI calls and does not receive an OpenAI API key.

## Leaderboards and privacy

- The application shows a weekly top ten for each chapter, starting Monday at 00:00 UTC.
- The server stores only the weekly best server-validated score, display name, chapter,
  timestamp, and a hash of the browser profile ID.
- Detailed learning history stays on the device.
- Duplicate names are allowed. Without authentication, leaderboard identity ownership cannot
  be guaranteed, although server-authoritative scoring prevents direct score submission.

## Initial scale and platforms

- One server process supports tens of concurrent players across eight chapter rooms.
- Desktop keyboard and mobile touch controls are launch requirements.
