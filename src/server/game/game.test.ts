import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../shared/gameConfig';
import type { ArenaState, AuthoritativePlayer, Point } from '../../shared/types';
import {
  hasHazardCollision,
  hasSelfCollision,
  markSelfCollisionDeath,
} from './collisions';
import { createChapterHazards, hazardGraceTicks } from './hazards';
import { advancePlayer } from './movement';
import { applyInput, createAuthoritativePlayer } from './player';
import { applyQuizResult, collectOrb, continueAfterQuiz } from './scoring';
import { advanceArena } from './simulation';

function createPlayer(id = 'player-a'): AuthoritativePlayer {
  return createAuthoritativePlayer({
    id,
    profileId: `profile-${id}`,
    runId: `run-${id}`,
    name: id,
    color: '#fff',
    chapter: 3,
    start: { x: 0, y: 0 },
    angle: 0,
  });
}

function selfCollidingSegments(length: number): Point[] {
  const loop: Point[] = [
    { x: 0, y: 0 },
    { x: -0.5, y: 0 },
    { x: -0.5, y: 0.5 },
    { x: 0, y: 0.5 },
    { x: 0.5, y: 0.5 },
    { x: 0.5, y: 0 },
  ];
  return Array.from({ length }, (_, index) =>
    loop[index] ?? { x: 0.5 + (index - loop.length + 1) * 0.5, y: 0 },
  );
}

describe('authoritative player input and movement', () => {
  it('creates a player with independent score and length', () => {
    const player = createPlayer();
    expect(player.score).toBe(0);
    expect(player.targetLength).toBe(GAME_CONFIG.initialLength);
    expect(player.segments).toHaveLength(GAME_CONFIG.initialLength);
  });

  it('ignores stale input sequences', () => {
    const player = createPlayer();
    expect(applyInput(player, { left: true, right: false, boost: false }, 2)).toBe(true);
    expect(applyInput(player, { left: false, right: true, boost: false }, 1)).toBe(false);
    expect(player.input.left).toBe(true);
  });

  it('slides along a wall without dying', () => {
    const player = createPlayer();
    player.segments = player.segments.map((segment) => ({
      x: 75 - Math.abs(segment.x),
      y: segment.y,
    }));
    player.currentAngle = Math.PI / 4;
    advancePlayer(player, 0.1);
    expect(player.segments[0].x).toBe(75);
    expect(player.segments[0].y).toBeGreaterThan(0);
    expect(player.state).toBe('alive');
  });
});

describe('self collision', () => {
  it('is disabled below the configured minimum length', () => {
    const player = createPlayer();
    player.segments = selfCollidingSegments(GAME_CONFIG.selfCollisionMinimumLength - 1);
    expect(hasSelfCollision(player)).toBe(false);
  });

  it('is the authoritative death condition at the configured length', () => {
    const player = createPlayer();
    player.targetLength = GAME_CONFIG.selfCollisionMinimumLength;
    player.segments = selfCollidingSegments(GAME_CONFIG.selfCollisionMinimumLength);
    expect(markSelfCollisionDeath(player)).toBe(true);
    expect(player.state).toBe('dead');
    expect(markSelfCollisionDeath(player)).toBe(false);
  });
});

describe('scoring and quizzes', () => {
  it('caps length while allowing score to continue', () => {
    const player = createPlayer();
    player.targetLength = GAME_CONFIG.maximumLength - 1;
    player.score = 500;
    collectOrb(player, 5);
    expect(player.targetLength).toBe(GAME_CONFIG.maximumLength);
    expect(player.score).toBe(505);
  });

  it('opens one quiz after ten server-confirmed orbs', () => {
    const player = createPlayer();
    for (let count = 1; count < GAME_CONFIG.quizOrbInterval; count += 1) {
      expect(collectOrb(player, 1)).toBe(false);
    }
    expect(collectOrb(player, 1)).toBe(true);
    expect(player.state).toBe('quiz');
    expect(player.orbsSinceQuiz).toBe(0);
    expect(player.orbsCollected).toBe(GAME_CONFIG.quizOrbInterval);
    expect(collectOrb(player, 1)).toBe(false);
  });

  it('applies non-lethal incorrect-answer penalties', () => {
    const player = createPlayer();
    player.state = 'quiz';
    player.score = 2;
    player.targetLength = 12;
    player.segments = Array.from({ length: 12 }, (_, index) => ({ x: -index, y: 0 }));

    const result = applyQuizResult(player, false);
    expect(result).toEqual({ scoreDelta: -2, lengthDelta: -2 });
    expect(player.score).toBe(0);
    expect(player.targetLength).toBe(GAME_CONFIG.minimumLength);
    expect(player.state).toBe('quiz');
    expect(player.effects.slowdownRemaining).toBe(
      GAME_CONFIG.incorrectAnswerSlowdownSeconds,
    );
    expect(continueAfterQuiz(player)).toBe(true);
    expect(player.state).toBe('alive');
  });
});

describe('arena simulation', () => {
  it('awards a contested orb exactly once with deterministic tie-breaking', () => {
    const playerB = createPlayer('b');
    const playerA = createPlayer('a');
    const arena: ArenaState = {
      chapter: 3,
      tick: 0,
      players: { b: playerB, a: playerA },
      orbs: {
        orb: { id: 'orb', x: 0, y: 0, value: 1, color: '#0ff' },
      },
      hazards: createChapterHazards(3),
      hazardsActive: false,
      hazardActivationThreshold: GAME_CONFIG.hazardActivationOrbs,
    };

    const result = advanceArena(arena, 0);
    expect(result.collectedOrbIds).toEqual(['orb']);
    expect(playerA.score).toBe(1);
    expect(playerB.score).toBe(0);
    expect(arena.orbs).toEqual({});
  });

  it('emits one run summary for server-detected self collision', () => {
    const player = createPlayer();
    player.score = 42;
    player.targetLength = GAME_CONFIG.selfCollisionMinimumLength;
    player.segments = selfCollidingSegments(GAME_CONFIG.selfCollisionMinimumLength);
    const arena: ArenaState = {
      chapter: 3,
      tick: 0,
      players: { [player.id]: player },
      orbs: {},
      hazards: createChapterHazards(3),
      hazardsActive: false,
      hazardActivationThreshold: GAME_CONFIG.hazardActivationOrbs,
    };

    const result = advanceArena(arena, 0, new Date('2026-08-11T00:00:00.000Z'));
    expect(result.endedRuns).toEqual([
      {
        runId: player.runId,
        chapter: 3,
        score: 42,
        length: GAME_CONFIG.selfCollisionMinimumLength,
        endedBy: 'self_collision',
        endedAt: '2026-08-11T00:00:00.000Z',
      },
    ]);
  });

  it('activates hazards arena-wide after seven total collected orbs', () => {
    const collector = createPlayer('collector');
    const otherPlayer = createPlayer('other');
    collector.orbsCollected = GAME_CONFIG.hazardActivationOrbs - 1;
    collector.effects.hazardProtectionRemaining = 0;
    otherPlayer.effects.hazardProtectionRemaining = 0;
    const arena: ArenaState = {
      chapter: 3,
      tick: 0,
      players: { collector, otherPlayer },
      orbs: {
        activationOrb: {
          id: 'activationOrb',
          x: collector.segments[0].x,
          y: collector.segments[0].y,
          value: 1,
          color: '#0ff',
        },
      },
      hazards: createChapterHazards(3),
      hazardsActive: false,
      hazardActivationThreshold: GAME_CONFIG.hazardActivationOrbs,
    };

    expect(arena.hazardsActive).toBe(false);
    advanceArena(arena, 0);

    expect(collector.orbsCollected).toBe(GAME_CONFIG.hazardActivationOrbs);
    expect(otherPlayer.orbsCollected).toBe(0);
    expect(arena.hazardsActive).toBe(true);
    expect(arena.hazardActivatedAtTick).toBe(1);
    advanceArena(arena, 0);
    expect(arena.hazardActivatedAtTick).toBe(1);
  });

  it('makes hazard contact lethal only after the arena activation grace', () => {
    const player = createPlayer();
    const hazards = createChapterHazards(3);
    const hazard = Object.values(hazards)[0];
    player.segments[0] = { x: hazard.x, y: hazard.y };
    player.effects.hazardProtectionRemaining = 0;
    const arena: ArenaState = {
      chapter: 3,
      tick: hazardGraceTicks() - 1,
      players: { [player.id]: player },
      orbs: {},
      hazards,
      hazardsActive: true,
      hazardActivationThreshold: GAME_CONFIG.hazardActivationOrbs,
      hazardActivatedAtTick: 0,
    };

    expect(hasHazardCollision(arena, player)).toBe(false);
    arena.tick = hazardGraceTicks();
    expect(hasHazardCollision(arena, player)).toBe(true);

    const result = advanceArena(
      arena,
      0,
      new Date('2026-08-15T00:00:00.000Z'),
    );
    expect(result.endedRuns[0]).toMatchObject({
      runId: player.runId,
      endedBy: 'hazard_collision',
      endedAt: '2026-08-15T00:00:00.000Z',
    });
    expect(advanceArena(arena, 0).endedRuns).toEqual([]);
  });

  it('protects quiz players and grants two seconds of protection on continue', () => {
    const player = createPlayer();
    const hazards = createChapterHazards(3);
    const hazard = Object.values(hazards)[0];
    player.segments[0] = { x: hazard.x, y: hazard.y };
    player.state = 'quiz';
    player.effects.hazardProtectionRemaining = 0;
    const arena: ArenaState = {
      chapter: 3,
      tick: hazardGraceTicks(),
      players: { [player.id]: player },
      orbs: {},
      hazards,
      hazardsActive: true,
      hazardActivationThreshold: GAME_CONFIG.hazardActivationOrbs,
      hazardActivatedAtTick: 0,
    };

    expect(hasHazardCollision(arena, player)).toBe(false);
    expect(continueAfterQuiz(player)).toBe(true);
    expect(player.effects.hazardProtectionRemaining).toBe(
      GAME_CONFIG.hazardActivationGraceSeconds,
    );
    expect(hasHazardCollision(arena, player)).toBe(false);
    player.effects.hazardProtectionRemaining = 0;
    expect(hasHazardCollision(arena, player)).toBe(true);

    player.state = 'dead';
    expect(hasHazardCollision(arena, player)).toBe(false);
  });

  it('preserves self-collision precedence when the head also touches a hazard', () => {
    const player = createPlayer();
    player.targetLength = GAME_CONFIG.selfCollisionMinimumLength;
    player.segments = selfCollidingSegments(GAME_CONFIG.selfCollisionMinimumLength);
    player.effects.hazardProtectionRemaining = 0;
    const arena: ArenaState = {
      chapter: 3,
      tick: hazardGraceTicks(),
      players: { [player.id]: player },
      orbs: {},
      hazards: {
        overlap: {
          id: 'overlap',
          x: player.segments[0].x,
          y: player.segments[0].y,
          radius: GAME_CONFIG.hazardRadius,
        },
      },
      hazardsActive: true,
      hazardActivationThreshold: GAME_CONFIG.hazardActivationOrbs,
      hazardActivatedAtTick: 0,
    };

    const result = advanceArena(arena, 0);
    expect(result.endedRuns).toHaveLength(1);
    expect(result.endedRuns[0].endedBy).toBe('self_collision');
  });
});
