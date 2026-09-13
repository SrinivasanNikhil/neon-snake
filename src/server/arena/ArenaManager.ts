import { v4 as uuidv4 } from 'uuid';
import { CHAPTER_IDS, GAME_CONFIG } from '../../shared/gameConfig';
import type { InputPayload, JoinPayload, QuizQuestionPayload } from '../../shared/protocol';
import {
  MAX_ORBS,
  WORLD_SIZE,
  type ArenaSnapshot,
  type ArenaState,
  type AuthoritativePlayer,
  type ChapterId,
  type Hazard,
  type Orb,
  type Point,
  type RunSummary,
} from '../../shared/types';
import { createChapterHazards, isPointClearOfHazards } from '../game/hazards';
import { advanceArena } from '../game/simulation';
import { applyInput, createAuthoritativePlayer } from '../game/player';
import { applyQuizResult, continueAfterQuiz } from '../game/scoring';
import { QuestionService } from '../questions/questionService';

const COLORS = ['#ff7eb3', '#ffb86c', '#f1fa8c', '#50fa7b', '#8be9fd', '#bd93f9'];
const INITIAL_ORBS = 150;

function boundedRandom(random: () => number): number {
  const value = random();
  if (!Number.isFinite(value)) return 0.5;
  return Math.min(1 - Number.EPSILON, Math.max(0, value));
}

function isPlayerSpawnSafe(
  start: Point,
  angle: number,
  hazards: Record<string, Hazard>,
): boolean {
  return Array.from({ length: GAME_CONFIG.initialLength }, (_, index) => ({
    x: start.x - Math.cos(angle) * index * GAME_CONFIG.segmentSpacing,
    y: start.y - Math.sin(angle) * index * GAME_CONFIG.segmentSpacing,
  })).every((point) =>
    isPointClearOfHazards(
      point,
      hazards,
      GAME_CONFIG.hazardPlayerSpawnClearance,
    ),
  );
}

export type EndedRun = {
  playerId: string;
  profileId: string;
  displayName: string;
  summary: RunSummary;
};

export type ArenaTickResult = {
  endedRuns: EndedRun[];
  quizzes: Array<{ playerId: string; question: QuizQuestionPayload }>;
  missingQuestionPlayerIds: string[];
};

export type AnswerResult = {
  payload: {
    success: boolean;
    correctOptionId: string;
    explanation: string;
    reviewConcept: string;
    sourceUrl: string;
    sourceTitle: string;
    scoreDelta: number;
    lengthDelta: number;
  };
};

export class ArenaManager {
  private readonly arenas = new Map<ChapterId, ArenaState>();
  private readonly playerChapters = new Map<string, ChapterId>();
  private readonly answeredAttempts = new Set<string>();

  constructor(
    private readonly questionService = new QuestionService(),
    private readonly random: () => number = Math.random,
  ) {}

  roomName(chapter: ChapterId): string {
    return `chapter:${chapter}`;
  }

  join(playerId: string, payload: JoinPayload): AuthoritativePlayer {
    this.remove(playerId);
    const arena = this.getOrCreate(payload.chapter);
    const spawn = this.playerSpawn(arena);
    const player = createAuthoritativePlayer({
      id: playerId,
      profileId: payload.profileId,
      name: payload.name,
      color: COLORS[Math.floor(this.random() * COLORS.length)] ?? COLORS[0],
      chapter: payload.chapter,
      start: spawn.start,
      angle: spawn.angle,
    });

    arena.players[playerId] = player;
    this.playerChapters.set(playerId, payload.chapter);
    this.questionService.startPlayerRun(playerId, payload.chapter, payload.difficulty);
    return player;
  }

  remove(playerId: string): void {
    const chapter = this.playerChapters.get(playerId);
    if (chapter === undefined) return;
    const arena = this.arenas.get(chapter);
    if (arena) {
      const attemptId = arena.players[playerId]?.activeAttemptId;
      if (attemptId) this.answeredAttempts.delete(attemptId);
      delete arena.players[playerId];
      if (Object.keys(arena.players).length === 0) this.arenas.delete(chapter);
    }
    this.playerChapters.delete(playerId);
    this.questionService.endPlayerRun(playerId);
  }

  applyInput(playerId: string, payload: InputPayload): boolean {
    const player = this.getPlayer(playerId);
    if (!player) return false;
    return applyInput(
      player,
      { left: payload.left, right: payload.right, boost: payload.boost },
      payload.sequence,
    );
  }

  submitAnswer(
    playerId: string,
    attemptId: string,
    optionId: string,
  ): AnswerResult | null {
    const player = this.getPlayer(playerId);
    if (!player || player.state !== 'quiz' || player.activeAttemptId !== attemptId) return null;
    const evaluation = this.questionService.evaluate(playerId, attemptId, optionId);
    if (!evaluation) return null;
    const deltas = applyQuizResult(player, evaluation.correct);
    this.answeredAttempts.add(attemptId);
    return { payload: { ...evaluation.payload, ...deltas } };
  }

  continueAfterQuiz(playerId: string): boolean {
    const player = this.getPlayer(playerId);
    if (
      !player ||
      !player.activeAttemptId ||
      !this.answeredAttempts.has(player.activeAttemptId)
    ) {
      return false;
    }
    const attemptId = player.activeAttemptId;
    if (!continueAfterQuiz(player)) return false;
    delete player.activeAttemptId;
    this.answeredAttempts.delete(attemptId);
    this.questionService.clearAttempt(attemptId);
    return true;
  }

  tick(now = new Date()): ArenaTickResult {
    const result: ArenaTickResult = {
      endedRuns: [],
      quizzes: [],
      missingQuestionPlayerIds: [],
    };

    for (const arena of this.arenas.values()) {
      if (Object.keys(arena.players).length === 0) continue;
      const playersBeforeTick = { ...arena.players };
      const simulationResult = advanceArena(
        arena,
        1 / GAME_CONFIG.simulationRate,
        now,
      );

      for (const summary of simulationResult.endedRuns) {
        const player = Object.values(playersBeforeTick).find(
          (candidate) => candidate.runId === summary.runId,
        );
        if (player) {
          this.questionService.endPlayerRun(player.id);
          result.endedRuns.push({
            playerId: player.id,
            profileId: player.profileId,
            displayName: player.name,
            summary,
          });
        }
      }

      for (const playerId of simulationResult.quizTriggeredPlayerIds) {
        const player = arena.players[playerId];
        if (!player) continue;
        const question = this.questionService.createAttempt(playerId, arena.chapter);
        if (!question) {
          player.state = 'alive';
          result.missingQuestionPlayerIds.push(playerId);
          continue;
        }
        player.activeAttemptId = question.attemptId;
        result.quizzes.push({ playerId, question });
      }

      if (Object.keys(arena.orbs).length < MAX_ORBS && this.random() < 0.2) {
        this.spawnOrb(arena);
      }
    }

    return result;
  }

  snapshot(chapter: ChapterId): ArenaSnapshot {
    const arena = this.getOrCreate(chapter);
    return {
      chapter,
      tick: arena.tick,
      players: Object.fromEntries(
        Object.values(arena.players).map((player) => [
          player.id,
          {
            id: player.id,
            runId: player.runId,
            name: player.name,
            color: player.color,
            chapter: player.chapter,
            segments: player.segments.map((segment) => ({ ...segment })),
            targetLength: player.targetLength,
            score: player.score,
            orbsSinceQuiz: player.orbsSinceQuiz,
            orbsCollected: player.orbsCollected,
            state: player.state,
            currentAngle: player.currentAngle,
            lastProcessedInput: player.lastProcessedInput,
            effects: { ...player.effects },
          },
        ]),
      ),
      orbs: Object.fromEntries(
        Object.values(arena.orbs).map((orb) => [orb.id, { ...orb }]),
      ),
      hazards: Object.fromEntries(
        Object.values(arena.hazards).map((hazard) => [hazard.id, { ...hazard }]),
      ),
      hazardsActive: arena.hazardsActive,
      hazardActivationThreshold: arena.hazardActivationThreshold,
      hazardActivatedAtTick: arena.hazardActivatedAtTick,
    };
  }

  getArena(chapter: ChapterId): ArenaState | undefined {
    return this.arenas.get(chapter);
  }

  getPlayer(playerId: string): AuthoritativePlayer | undefined {
    const chapter = this.playerChapters.get(playerId);
    return chapter === undefined ? undefined : this.arenas.get(chapter)?.players[playerId];
  }

  getPlayerChapter(playerId: string): ChapterId | undefined {
    return this.playerChapters.get(playerId);
  }

  activeChapters(): ChapterId[] {
    return CHAPTER_IDS.filter(
      (chapter) => Object.keys(this.arenas.get(chapter)?.players ?? {}).length > 0,
    );
  }

  private getOrCreate(chapter: ChapterId): ArenaState {
    const existing = this.arenas.get(chapter);
    if (existing) return existing;

    const arena: ArenaState = {
      chapter,
      tick: 0,
      players: {},
      orbs: {},
      hazards: createChapterHazards(chapter),
      hazardsActive: false,
      hazardActivationThreshold: GAME_CONFIG.hazardActivationOrbs,
    };
    for (let index = 0; index < INITIAL_ORBS; index += 1) this.spawnOrb(arena);
    this.arenas.set(chapter, arena);
    return arena;
  }

  private spawnOrb(arena: ArenaState): Orb | null {
    if (Object.keys(arena.orbs).length >= MAX_ORBS) return null;
    const point = this.orbSpawnPoint(arena);
    const orb: Orb = {
      id: uuidv4(),
      x: point.x,
      y: point.y,
      value: 1,
      color: COLORS[Math.floor(this.random() * COLORS.length)] ?? COLORS[0],
    };
    arena.orbs[orb.id] = orb;
    return orb;
  }

  private playerSpawn(arena: ArenaState): { start: Point; angle: number } {
    const margin = 20;
    for (let attempt = 0; attempt < GAME_CONFIG.hazardSpawnAttempts; attempt += 1) {
      const start = {
        x: (boundedRandom(this.random) - 0.5) * (WORLD_SIZE - margin),
        y: (boundedRandom(this.random) - 0.5) * (WORLD_SIZE - margin),
      };
      const angle = boundedRandom(this.random) * Math.PI * 2;
      if (isPlayerSpawnSafe(start, angle, arena.hazards)) return { start, angle };
    }

    const fallbackStarts: Point[] = [
      { x: 0, y: 0 },
      { x: -55, y: -55 },
      { x: 55, y: 55 },
      { x: -55, y: 55 },
      { x: 55, y: -55 },
    ];
    for (let index = 0; index < fallbackStarts.length; index += 1) {
      const start = fallbackStarts[index];
      const angle = ((arena.chapter + index) * Math.PI) / 4;
      if (isPlayerSpawnSafe(start, angle, arena.hazards)) return { start, angle };
    }

    throw new Error(`No hazard-safe player spawn for chapter ${arena.chapter}`);
  }

  private orbSpawnPoint(arena: ArenaState): Point {
    for (let attempt = 0; attempt < GAME_CONFIG.hazardSpawnAttempts; attempt += 1) {
      const point = {
        x: (boundedRandom(this.random) - 0.5) * WORLD_SIZE,
        y: (boundedRandom(this.random) - 0.5) * WORLD_SIZE,
      };
      if (
        isPointClearOfHazards(
          point,
          arena.hazards,
          GAME_CONFIG.hazardOrbSpawnClearance,
        )
      ) {
        return point;
      }
    }

    for (let index = 0; index < 49; index += 1) {
      const point = {
        x: ((index % 7) - 3) * 10,
        y: (Math.floor(index / 7) - 3) * 10,
      };
      if (
        isPointClearOfHazards(
          point,
          arena.hazards,
          GAME_CONFIG.hazardOrbSpawnClearance,
        )
      ) {
        return point;
      }
    }

    throw new Error(`No hazard-safe orb spawn for chapter ${arena.chapter}`);
  }
}
