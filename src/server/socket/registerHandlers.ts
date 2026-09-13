import type { Server } from 'socket.io';
import { GAME_CONFIG } from '../../shared/gameConfig';
import type {
  ClientToServerEvents,
  InterServerEvents,
  JoinPayload,
  ServerToClientEvents,
  SocketData,
} from '../../shared/protocol';
import type { ChapterId, LeaderboardEntry } from '../../shared/types';
import type { EndedRun } from '../arena/ArenaManager';
import { ArenaManager } from '../arena/ArenaManager';
import {
  InputPayloadSchema,
  JoinPayloadSchema,
  LeaderboardRequestPayloadSchema,
  SubmitAnswerPayloadSchema,
} from '../validation';
import { SocketRateLimiter } from './rateLimit';

export type GameSocketServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>;

export type RealtimeHandlersOptions = {
  onRunEnded?: (run: EndedRun) => void;
  getLeaderboard?: (chapter: ChapterId) => LeaderboardEntry[];
};

const error = (code: string, message: string) => ({ code, message });

export function registerRealtimeHandlers(
  io: GameSocketServer,
  arenas: ArenaManager,
  options: RealtimeHandlersOptions = {},
): void {
  io.on('connection', (socket) => {
    const rateLimiter = new SocketRateLimiter({
      join: { maximum: 5, windowMs: 10_000 },
      leaderboard: { maximum: 20, windowMs: 10_000 },
      input: { maximum: 90, windowMs: 1_000 },
      answer: { maximum: 10, windowMs: 10_000 },
      continue: { maximum: 10, windowMs: 10_000 },
    });

    socket.on('join', (untrustedPayload) => {
      if (!rateLimiter.allow('join')) {
        socket.emit('error_message', error('rate_limited', 'Too many join attempts.'));
        return;
      }
      const parsed = JoinPayloadSchema.safeParse(untrustedPayload);
      if (!parsed.success) {
        socket.emit(
          'error_message',
          error(
            'invalid_join',
            'A valid name, anonymous profile ID, chapter, and difficulty are required.',
          ),
        );
        return;
      }
      const payload = parsed.data as JoinPayload;

      const previousChapter = arenas.getPlayerChapter(socket.id);
      if (previousChapter !== undefined) socket.leave(arenas.roomName(previousChapter));

      const player = arenas.join(socket.id, payload);
      socket.data.playerId = player.id;
      socket.data.profileId = payload.profileId;
      socket.data.chapter = payload.chapter;
      socket.join(arenas.roomName(payload.chapter));
      socket.emit('init', {
        playerId: player.id,
        chapter: payload.chapter,
        tick: arenas.snapshot(payload.chapter).tick,
      });
      socket.emit('snapshot', arenas.snapshot(payload.chapter));

      const leaderboard = options.getLeaderboard?.(payload.chapter);
      if (leaderboard) {
        socket.emit('leaderboard', { chapter: payload.chapter, entries: leaderboard });
      }
    });

    socket.on('request_leaderboard', (untrustedPayload) => {
      if (!rateLimiter.allow('leaderboard')) {
        socket.emit(
          'error_message',
          error('rate_limited', 'Too many leaderboard requests.'),
        );
        return;
      }
      const parsed = LeaderboardRequestPayloadSchema.safeParse(untrustedPayload);
      if (!parsed.success) {
        socket.emit(
          'error_message',
          error('invalid_leaderboard_request', 'Choose a chapter from 3 through 10.'),
        );
        return;
      }
      const chapter = parsed.data.chapter as ChapterId;
      socket.emit('leaderboard', {
        chapter,
        entries: options.getLeaderboard?.(chapter) ?? [],
      });
    });

    socket.on('input', (untrustedPayload) => {
      if (!rateLimiter.allow('input')) {
        socket.emit('error_message', error('rate_limited', 'Input rate exceeded.'));
        return;
      }
      const parsed = InputPayloadSchema.safeParse(untrustedPayload);
      if (!parsed.success) {
        socket.emit('error_message', error('invalid_input', 'The input command was rejected.'));
        return;
      }
      arenas.applyInput(socket.id, parsed.data);
    });

    socket.on('submit_answer', (untrustedPayload) => {
      if (!rateLimiter.allow('answer')) {
        socket.emit('error_message', error('rate_limited', 'Too many answer attempts.'));
        return;
      }
      const parsed = SubmitAnswerPayloadSchema.safeParse(untrustedPayload);
      if (!parsed.success) {
        socket.emit('error_message', error('invalid_answer', 'The answer was rejected.'));
        return;
      }

      const result = arenas.submitAnswer(
        socket.id,
        parsed.data.attemptId,
        parsed.data.optionId,
      );
      if (!result) {
        socket.emit(
          'error_message',
          error('inactive_attempt', 'This quiz attempt is no longer active.'),
        );
        return;
      }
      socket.emit('quiz_result', result.payload);
    });

    socket.on('continue_after_quiz', () => {
      if (!rateLimiter.allow('continue')) {
        socket.emit('error_message', error('rate_limited', 'Too many continue attempts.'));
        return;
      }
      if (!arenas.continueAfterQuiz(socket.id)) {
        socket.emit(
          'error_message',
          error('quiz_not_ready', 'There is no completed quiz to continue.'),
        );
      }
    });

    socket.on('disconnect', () => {
      arenas.remove(socket.id);
    });
  });
}

export type GameLoop = {
  stop: () => void;
  tickNow: (now?: Date) => void;
  snapshotNow: () => void;
};

export function startGameLoop(
  io: GameSocketServer,
  arenas: ArenaManager,
  options: RealtimeHandlersOptions = {},
): GameLoop {
  const tickNow = (now = new Date()) => {
    const result = arenas.tick(now);
    for (const quiz of result.quizzes) {
      io.to(quiz.playerId).emit('trigger_quiz', quiz.question);
    }
    for (const playerId of result.missingQuestionPlayerIds) {
      io.to(playerId).emit(
        'error_message',
        error('question_bank_empty', 'This chapter question bank is not populated yet.'),
      );
    }
    for (const ended of result.endedRuns) {
      io.to(ended.playerId).emit('run_ended', ended.summary);
      options.onRunEnded?.(ended);
      const entries = options.getLeaderboard?.(ended.summary.chapter);
      if (entries) {
        io.to(arenas.roomName(ended.summary.chapter)).emit('leaderboard', {
          chapter: ended.summary.chapter,
          entries,
        });
      }
    }
  };

  const snapshotNow = () => {
    for (const chapter of arenas.activeChapters()) {
      io.to(arenas.roomName(chapter)).emit('snapshot', arenas.snapshot(chapter));
    }
  };

  const tickInterval = setInterval(tickNow, 1_000 / GAME_CONFIG.simulationRate);
  const snapshotInterval = setInterval(snapshotNow, 1_000 / GAME_CONFIG.snapshotRate);

  return {
    tickNow,
    snapshotNow,
    stop: () => {
      clearInterval(tickInterval);
      clearInterval(snapshotInterval);
    },
  };
}
