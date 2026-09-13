import { describe, expect, it } from 'vitest';
import { GAME_CONFIG } from '../../shared/gameConfig';
import type { ChapterId } from '../../shared/types';
import { QuestionService } from '../questions/questionService';
import { createChapterHazards, isPointClearOfHazards } from '../game/hazards';
import { ArenaManager } from './ArenaManager';

const PROFILE_ID = '4f5fa847-e21b-42b4-9b54-f67ca92462c7';

function join(manager: ArenaManager, playerId: string, chapter: ChapterId = 3) {
  return manager.join(playerId, {
    profileId: PROFILE_ID,
    name: playerId,
    chapter,
    difficulty: 1,
  });
}

describe('ArenaManager', () => {
  it('isolates players and snapshots by chapter', () => {
    const manager = new ArenaManager(new QuestionService(undefined, () => 0), () => 0.5);
    join(manager, 'chapter-three', 3);
    join(manager, 'chapter-four', 4);

    expect(Object.keys(manager.snapshot(3).players)).toEqual(['chapter-three']);
    expect(Object.keys(manager.snapshot(4).players)).toEqual(['chapter-four']);
    expect(manager.roomName(3)).toBe('chapter:3');
  });

  it('replaces a player when they join a different chapter', () => {
    const manager = new ArenaManager(new QuestionService(undefined, () => 0), () => 0.5);
    join(manager, 'player', 3);
    join(manager, 'player', 8);

    expect(manager.snapshot(3).players).toEqual({});
    expect(manager.snapshot(8).players.player.chapter).toBe(8);
  });

  it('accepts only increasing input sequences', () => {
    const manager = new ArenaManager(new QuestionService(undefined, () => 0), () => 0.5);
    const player = join(manager, 'player');
    expect(
      manager.applyInput('player', {
        sequence: 2,
        left: true,
        right: false,
        boost: false,
      }),
    ).toBe(true);
    expect(
      manager.applyInput('player', {
        sequence: 1,
        left: false,
        right: true,
        boost: true,
      }),
    ).toBe(false);
    expect(player.input).toEqual({ left: true, right: false, boost: false });
  });

  it('redacts profile, input, and active attempt fields from snapshots', () => {
    const manager = new ArenaManager(new QuestionService(undefined, () => 0), () => 0.5);
    const player = join(manager, 'player');
    player.activeAttemptId = 'secret-attempt';
    const snapshotPlayer = manager.snapshot(3).players.player;

    expect(snapshotPlayer).not.toHaveProperty('profileId');
    expect(snapshotPlayer).not.toHaveProperty('input');
    expect(snapshotPlayer).not.toHaveProperty('activeAttemptId');
  });

  it('publishes deterministic chapter hazards and a fair activation threshold', () => {
    const manager = new ArenaManager(new QuestionService(undefined, () => 0), () => 0.5);
    join(manager, 'player', 6);
    const snapshot = manager.snapshot(6);

    expect(snapshot.hazards).toEqual(createChapterHazards(6));
    expect(snapshot.hazardsActive).toBe(false);
    expect(snapshot.hazardActivationThreshold).toBe(GAME_CONFIG.hazardActivationOrbs);
  });

  it('keeps initial players and orbs clear of chapter hazards', () => {
    const manager = new ArenaManager(new QuestionService(undefined, () => 0), () => 0.5);
    const player = join(manager, 'player');
    const arena = manager.getArena(3)!;

    expect(
      player.segments.every((segment) =>
        isPointClearOfHazards(
          segment,
          arena.hazards,
          GAME_CONFIG.hazardPlayerSpawnClearance,
        ),
      ),
    ).toBe(true);
    expect(
      Object.values(arena.orbs).every((orb) =>
        isPointClearOfHazards(
          orb,
          arena.hazards,
          GAME_CONFIG.hazardOrbSpawnClearance,
        ),
      ),
    ).toBe(true);
    expect(player.effects.hazardProtectionRemaining).toBe(
      GAME_CONFIG.hazardActivationGraceSeconds,
    );
  });

  it('resets hazard activation after the last player leaves an arena', () => {
    const manager = new ArenaManager(new QuestionService(undefined, () => 0), () => 0.5);
    join(manager, 'player');
    const firstArena = manager.getArena(3)!;
    firstArena.hazardsActive = true;
    firstArena.hazardActivatedAtTick = firstArena.tick;

    manager.remove('player');
    join(manager, 'next-player');
    const nextArena = manager.getArena(3)!;

    expect(nextArena).not.toBe(firstArena);
    expect(nextArena.hazardsActive).toBe(false);
    expect(nextArena.hazardActivatedAtTick).toBeUndefined();
  });

  it('protects a hazard-safe late joiner in an active arena', () => {
    const manager = new ArenaManager(new QuestionService(undefined, () => 0), () => 0.5);
    join(manager, 'first-player');
    const arena = manager.getArena(3)!;
    arena.hazardsActive = true;
    arena.hazardActivatedAtTick = 0;
    arena.tick = GAME_CONFIG.simulationRate * 10;

    const latePlayer = join(manager, 'late-player');

    expect(manager.getArena(3)).toBe(arena);
    expect(latePlayer.effects.hazardProtectionRemaining).toBe(
      GAME_CONFIG.hazardActivationGraceSeconds,
    );
    expect(
      latePlayer.segments.every((segment) =>
        isPointClearOfHazards(
          segment,
          arena.hazards,
          GAME_CONFIG.hazardPlayerSpawnClearance,
        ),
      ),
    ).toBe(true);
  });

  it('uses bounded deterministic fallbacks when RNG repeats an unsafe point', () => {
    const repeatedUnsafeValue = 0.5 + 19.09 / 150;
    const manager = new ArenaManager(
      new QuestionService(undefined, () => 0),
      () => repeatedUnsafeValue,
    );

    const player = join(manager, 'player');
    const arena = manager.getArena(3)!;

    expect(player.segments[0]).toEqual({ x: 0, y: 0 });
    expect(
      player.segments.every((segment) =>
        isPointClearOfHazards(
          segment,
          arena.hazards,
          GAME_CONFIG.hazardPlayerSpawnClearance,
        ),
      ),
    ).toBe(true);
    expect(
      Object.values(arena.orbs).every((orb) =>
        isPointClearOfHazards(
          orb,
          arena.hazards,
          GAME_CONFIG.hazardOrbSpawnClearance,
        ),
      ),
    ).toBe(true);
  });

  it('assigns and validates a server-owned quiz attempt', () => {
    const manager = new ArenaManager(new QuestionService(undefined, () => 0), () => 0.5);
    const player = join(manager, 'player');
    player.orbsSinceQuiz = GAME_CONFIG.quizOrbInterval - 1;
    const arena = manager.getArena(3)!;
    arena.orbs = {
      quizOrb: {
        id: 'quizOrb',
        x: player.segments[0].x,
        y: player.segments[0].y,
        value: 1,
        color: '#fff',
      },
    };

    const tick = manager.tick();
    expect(tick.quizzes).toHaveLength(1);
    const question = tick.quizzes[0].question;
    expect(question.chapter).toBe(3);
    expect(question).not.toHaveProperty('correctOptionId');
    expect(manager.continueAfterQuiz('player')).toBe(false);
    expect(manager.submitAnswer('other-player', question.attemptId, 'a')).toBeNull();
    expect(manager.submitAnswer('player', 'wrong-attempt', 'a')).toBeNull();

    const answer = manager.submitAnswer('player', question.attemptId, 'c');
    expect(answer?.payload.success).toBe(true);
    expect(manager.submitAnswer('player', question.attemptId, 'c')).toBeNull();
    expect(player.state).toBe('quiz');
    expect(manager.continueAfterQuiz('player')).toBe(true);
    expect(player.state).toBe('alive');
  });

  it('does not expose or apply client-supplied score or position commands', () => {
    const manager = new ArenaManager(new QuestionService(undefined, () => 0), () => 0.5);
    const player = join(manager, 'player');
    const originalScore = player.score;
    const originalLength = player.targetLength;

    expect(manager).not.toHaveProperty('updateState');
    expect(manager).not.toHaveProperty('collectOrb');
    expect(player.score).toBe(originalScore);
    expect(player.targetLength).toBe(originalLength);
  });
});
