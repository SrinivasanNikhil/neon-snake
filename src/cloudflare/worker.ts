import approvedQuestionIndex from '../../content/questions/index.json';
import { GAME_CONFIG } from '../shared/gameConfig';
import type { JoinPayload, ServerToClientEvents } from '../shared/protocol';
import { encodeServerMessage, parseClientMessage } from '../shared/realtimeProtocol';
import { QuestionBankSchema, type QuestionWithAnswer } from '../shared/questionSchema';
import type { ChapterId, LeaderboardEntry } from '../shared/types';
import { ArenaManager, type EndedRun } from '../server/arena/ArenaManager';
import { weekStartUtcIso } from '../server/db/clock';
import { QuestionService } from '../server/questions/questionService';
import { SocketRateLimiter } from '../server/socket/rateLimit';
import {
  InputPayloadSchema,
  JoinPayloadSchema,
  LeaderboardRequestPayloadSchema,
  SubmitAnswerPayloadSchema,
} from '../server/validation';
import {
  isAllowedOrigin,
  isMessageWithinLimit,
} from './wire';

type Fetcher = { fetch(request: Request): Promise<Response> };
type DurableObjectStub = Fetcher;
type DurableObjectNamespace = {
  idFromName(name: string): unknown;
  get(id: unknown): DurableObjectStub;
};

type SqlStorageCursor<Row> = Iterable<Row> & {
  rowsWritten: number;
  toArray(): Row[];
};

type SqlStorage = {
  exec<Row = Record<string, unknown>>(
    query: string,
    ...bindings: Array<string | number | null>
  ): SqlStorageCursor<Row>;
};

type DurableWebSocket = WebSocket & {
  deserializeAttachment(): unknown;
  serializeAttachment(value: unknown): void;
};

type DurableObjectState = {
  storage: { sql: SqlStorage };
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(): DurableWebSocket[];
  waitUntil(promise: Promise<unknown>): void;
};

declare const WebSocketPair: {
  new (): { 0: WebSocket; 1: DurableWebSocket };
};

export type Env = {
  ASSETS: Fetcher;
  CLASSROOM: DurableObjectNamespace;
  ALLOWED_ORIGINS?: string;
};

type ConnectionAttachment = {
  connectionId: string;
  joined?: JoinPayload;
};

type Connection = ConnectionAttachment & {
  rateLimiter: SocketRateLimiter;
};

type WeeklyScoreRow = {
  chapter: number;
  display_name: string;
  score: number;
  achieved_at: string;
  profile_hash: string;
};

const APPROVED_QUESTIONS = validateApprovedQuestionIndex(
  approvedQuestionIndex as unknown,
);

const RATE_LIMIT_RULES = {
  join: { maximum: 5, windowMs: 10_000 },
  leaderboard: { maximum: 20, windowMs: 10_000 },
  input: { maximum: 20, windowMs: 1_000 },
  answer: { maximum: 10, windowMs: 10_000 },
  continue: { maximum: 10, windowMs: 10_000 },
};

const errorPayload = (code: string, message: string) => ({ code, message });

/** The Worker is deliberately thin: one globally named Durable Object owns all
 * classroom state, while Cloudflare Static Assets serves the Vite application.
 */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health/live') return json({ status: 'ok' });
    if (url.pathname === '/api/health/ready') return json({ status: 'ready' });
    if (url.pathname === '/api/health') return json({ status: 'ok' });

    if (url.pathname === '/api/realtime') {
      if (request.headers.get('Upgrade')?.toLocaleLowerCase() !== 'websocket') {
        return json({ error: 'websocket_upgrade_required' }, 426);
      }
      if (!isAllowedOrigin(request.url, request.headers.get('Origin'), env.ALLOWED_ORIGINS)) {
        return json({ error: 'origin_not_allowed' }, 403);
      }
      const classroom = env.CLASSROOM.get(env.CLASSROOM.idFromName('global'));
      return classroom.fetch(request);
    }

    return env.ASSETS.fetch(request);
  },
};

/** A single SQLite-backed object is sufficient for the intended classroom-sized
 * free-tier deployment and keeps chapter broadcasts and score updates ordered.
 */
export class NeonSnakeClassroom {
  private readonly arenas: ArenaManager;
  private readonly connections = new Map<DurableWebSocket, Connection>();
  private tickInterval?: ReturnType<typeof setInterval>;
  private snapshotInterval?: ReturnType<typeof setInterval>;

  constructor(
    private readonly state: DurableObjectState,
    _env: Env,
  ) {
    this.migrateDatabase();
    this.arenas = new ArenaManager(
      new QuestionService(undefined, Math.random, APPROVED_QUESTIONS),
    );
    this.restoreConnections();
    this.startLoopsIfNeeded();
  }

  fetch(request: Request): Response {
    if (request.headers.get('Upgrade')?.toLocaleLowerCase() !== 'websocket') {
      return json({ error: 'websocket_upgrade_required' }, 426);
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const connection = this.newConnection();
    this.state.acceptWebSocket(server);
    this.connections.set(server, connection);
    server.serializeAttachment(attachmentFor(connection));

    return new Response(null, { status: 101, webSocket: client } as ResponseInit);
  }

  webSocketMessage(socket: DurableWebSocket, message: string | ArrayBuffer): void {
    const connection = this.connectionFor(socket);
    if (typeof message !== 'string') {
      this.sendError(socket, 'invalid_message', 'Only JSON text messages are accepted.');
      return;
    }

    if (!isMessageWithinLimit(message)) {
      this.sendError(socket, 'invalid_message', 'The message exceeds the 16 KiB limit.');
      return;
    }
    const parsed = parseClientMessage(message);
    if ('error' in parsed) {
      this.sendError(socket, 'invalid_message', 'The message must be a valid game event envelope.');
      return;
    }

    switch (parsed.message.event) {
      case 'join':
        this.handleJoin(socket, connection, parsed.message.payload);
        return;
      case 'request_leaderboard':
        this.handleLeaderboardRequest(socket, connection, parsed.message.payload);
        return;
      case 'input':
        this.handleInput(socket, connection, parsed.message.payload);
        return;
      case 'submit_answer':
        this.handleAnswer(socket, connection, parsed.message.payload);
        return;
      case 'continue_after_quiz':
        this.handleContinue(socket, connection);
    }
  }

  webSocketClose(
    socket: DurableWebSocket,
    code: number,
    reason: string,
  ): void {
    this.disconnect(socket);
    try {
      socket.close(code, reason);
    } catch {
      // The peer can already be closed when Cloudflare delivers this callback.
    }
  }

  webSocketError(socket: DurableWebSocket): void {
    this.disconnect(socket);
  }

  private handleJoin(
    socket: DurableWebSocket,
    connection: Connection,
    untrustedPayload: unknown,
  ): void {
    if (!connection.rateLimiter.allow('join')) {
      this.sendError(socket, 'rate_limited', 'Too many join attempts.');
      return;
    }
    const parsed = JoinPayloadSchema.safeParse(untrustedPayload);
    if (!parsed.success) {
      this.sendError(
        socket,
        'invalid_join',
        'A valid name, anonymous profile ID, chapter, and difficulty are required.',
      );
      return;
    }

    const joined = parsed.data as JoinPayload;
    const player = this.arenas.join(connection.connectionId, joined);
    connection.joined = joined;
    socket.serializeAttachment(attachmentFor(connection));
    const snapshot = this.arenas.snapshot(joined.chapter);
    this.send(socket, 'init', {
      playerId: player.id,
      chapter: joined.chapter,
      tick: snapshot.tick,
    });
    this.send(socket, 'snapshot', snapshot);
    this.sendLeaderboard(socket, joined.chapter);
    this.startLoopsIfNeeded();
  }

  private handleLeaderboardRequest(
    socket: DurableWebSocket,
    connection: Connection,
    untrustedPayload: unknown,
  ): void {
    if (!connection.rateLimiter.allow('leaderboard')) {
      this.sendError(socket, 'rate_limited', 'Too many leaderboard requests.');
      return;
    }
    const parsed = LeaderboardRequestPayloadSchema.safeParse(untrustedPayload);
    if (!parsed.success) {
      this.sendError(
        socket,
        'invalid_leaderboard_request',
        'Choose a chapter from 3 through 10.',
      );
      return;
    }
    this.sendLeaderboard(socket, parsed.data.chapter as ChapterId);
  }

  private handleInput(
    socket: DurableWebSocket,
    connection: Connection,
    untrustedPayload: unknown,
  ): void {
    if (!connection.rateLimiter.allow('input')) {
      this.sendError(socket, 'rate_limited', 'Input rate exceeded.');
      this.disconnect(socket);
      try {
        socket.close(1008, 'Input rate exceeded.');
      } catch {
        // The disconnect path has already removed the player.
      }
      return;
    }
    const parsed = InputPayloadSchema.safeParse(untrustedPayload);
    if (!parsed.success) {
      this.sendError(socket, 'invalid_input', 'The input command was rejected.');
      return;
    }
    this.arenas.applyInput(connection.connectionId, parsed.data);
  }

  private handleAnswer(
    socket: DurableWebSocket,
    connection: Connection,
    untrustedPayload: unknown,
  ): void {
    if (!connection.rateLimiter.allow('answer')) {
      this.sendError(socket, 'rate_limited', 'Too many answer attempts.');
      return;
    }
    const parsed = SubmitAnswerPayloadSchema.safeParse(untrustedPayload);
    if (!parsed.success) {
      this.sendError(socket, 'invalid_answer', 'The answer was rejected.');
      return;
    }
    const result = this.arenas.submitAnswer(
      connection.connectionId,
      parsed.data.attemptId,
      parsed.data.optionId,
    );
    if (!result) {
      this.sendError(socket, 'inactive_attempt', 'This quiz attempt is no longer active.');
      return;
    }
    this.send(socket, 'quiz_result', result.payload);
  }

  private handleContinue(socket: DurableWebSocket, connection: Connection): void {
    if (!connection.rateLimiter.allow('continue')) {
      this.sendError(socket, 'rate_limited', 'Too many continue attempts.');
      return;
    }
    if (!this.arenas.continueAfterQuiz(connection.connectionId)) {
      this.sendError(
        socket,
        'quiz_not_ready',
        'There is no completed quiz to continue.',
      );
    }
  }

  private tick(): void {
    const result = this.arenas.tick(new Date());
    for (const quiz of result.quizzes) {
      const socket = this.socketForPlayer(quiz.playerId);
      if (socket) this.send(socket, 'trigger_quiz', quiz.question);
    }
    for (const playerId of result.missingQuestionPlayerIds) {
      const socket = this.socketForPlayer(playerId);
      if (socket) {
        this.sendError(
          socket,
          'question_bank_empty',
          'This chapter question bank is not populated yet.',
        );
      }
    }
    for (const ended of result.endedRuns) {
      const socket = this.socketForPlayer(ended.playerId);
      if (socket) this.send(socket, 'run_ended', ended.summary);
      const connection = socket ? this.connections.get(socket) : undefined;
      if (socket && connection) {
        delete connection.joined;
        socket.serializeAttachment(attachmentFor(connection));
      }
      this.arenas.remove(ended.playerId);
      this.state.waitUntil(this.recordEndedRun(ended, socket));
    }
    this.stopLoopsIfEmpty();
  }

  private snapshot(): void {
    for (const chapter of this.arenas.activeChapters()) {
      const snapshot = this.arenas.snapshot(chapter);
      this.broadcastChapter(chapter, 'snapshot', snapshot);
    }
  }

  private startLoopsIfNeeded(): void {
    if (this.arenas.activeChapters().length === 0) return;
    if (!this.tickInterval) {
      this.tickInterval = setInterval(
        () => this.tick(),
        1_000 / GAME_CONFIG.simulationRate,
      );
    }
    if (!this.snapshotInterval) {
      this.snapshotInterval = setInterval(
        () => this.snapshot(),
        1_000 / GAME_CONFIG.snapshotRate,
      );
    }
  }

  private stopLoopsIfEmpty(): void {
    if (this.arenas.activeChapters().length > 0) return;
    if (this.tickInterval) clearInterval(this.tickInterval);
    if (this.snapshotInterval) clearInterval(this.snapshotInterval);
    this.tickInterval = undefined;
    this.snapshotInterval = undefined;
  }

  private disconnect(socket: DurableWebSocket): void {
    const connection = this.connections.get(socket);
    if (!connection) return;
    this.arenas.remove(connection.connectionId);
    this.connections.delete(socket);
    this.stopLoopsIfEmpty();
  }

  private restoreConnections(): void {
    for (const socket of this.state.getWebSockets()) {
      const attachment = parseConnectionAttachment(socket.deserializeAttachment());
      const connection = attachment
        ? {
            connectionId: attachment.connectionId,
            rateLimiter: new SocketRateLimiter(RATE_LIMIT_RULES),
          }
        : this.newConnection();
      this.connections.set(socket, connection);
      socket.serializeAttachment(attachmentFor(connection));

      // Authoritative runs are intentionally in memory. If Cloudflare restarts
      // the object during a run, force a clean reconnect instead of silently
      // inventing a replacement snake with stale client/quiz state.
      if (attachment?.joined) {
        try {
          socket.close(1012, 'Game server restarted; reconnect to rejoin.');
        } catch {
          this.connections.delete(socket);
        }
      }
    }
  }

  private connectionFor(socket: DurableWebSocket): Connection {
    const existing = this.connections.get(socket);
    if (existing) return existing;
    const restored = parseConnectionAttachment(socket.deserializeAttachment());
    const connection = restored
      ? { ...restored, rateLimiter: new SocketRateLimiter(RATE_LIMIT_RULES) }
      : this.newConnection();
    this.connections.set(socket, connection);
    return connection;
  }

  private newConnection(): Connection {
    return {
      connectionId: crypto.randomUUID(),
      rateLimiter: new SocketRateLimiter(RATE_LIMIT_RULES),
    };
  }

  private socketForPlayer(playerId: string): DurableWebSocket | undefined {
    for (const [socket, connection] of this.connections) {
      if (connection.connectionId === playerId) return socket;
    }
    return undefined;
  }

  private broadcastChapter<TEvent extends keyof ServerToClientEvents>(
    chapter: ChapterId,
    event: TEvent,
    ...args: Parameters<ServerToClientEvents[TEvent]>
  ): void {
    const encoded = encodeServerMessage(event, ...args);
    for (const [socket, connection] of this.connections) {
      if (connection.joined?.chapter === chapter) this.sendEncoded(socket, encoded);
    }
  }

  private send<TEvent extends keyof ServerToClientEvents>(
    socket: DurableWebSocket,
    event: TEvent,
    ...args: Parameters<ServerToClientEvents[TEvent]>
  ): void {
    this.sendEncoded(socket, encodeServerMessage(event, ...args));
  }

  private sendError(socket: DurableWebSocket, code: string, message: string): void {
    this.send(socket, 'error_message', errorPayload(code, message));
  }

  private sendEncoded(socket: DurableWebSocket, encoded: string): void {
    try {
      socket.send(encoded);
    } catch {
      this.disconnect(socket);
    }
  }

  private async recordEndedRun(
    ended: EndedRun,
    playerSocket?: DurableWebSocket,
  ): Promise<void> {
    const profileHash = await sha256Hex(ended.profileId);
    const now = new Date(ended.summary.endedAt);
    this.state.storage.sql.exec(
      `INSERT INTO weekly_scores (
        week_start, chapter, profile_hash, display_name, score, achieved_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT (week_start, chapter, profile_hash) DO UPDATE SET
        display_name = excluded.display_name,
        score = excluded.score,
        achieved_at = excluded.achieved_at
      WHERE excluded.score > weekly_scores.score`,
      weekStartUtcIso(now),
      ended.summary.chapter,
      profileHash,
      ended.displayName,
      Math.max(0, Math.floor(ended.summary.score)),
      now.toISOString(),
    );
    if (playerSocket) this.sendLeaderboard(playerSocket, ended.summary.chapter);
    this.broadcastLeaderboard(ended.summary.chapter);
  }

  private leaderboard(chapter: ChapterId, now = new Date()): LeaderboardEntry[] {
    const rows = this.state.storage.sql
      .exec<WeeklyScoreRow>(
        `SELECT chapter, display_name, score, achieved_at, profile_hash
         FROM weekly_scores
         WHERE week_start = ? AND chapter = ?
         ORDER BY score DESC, achieved_at ASC, profile_hash ASC
         LIMIT 10`,
        weekStartUtcIso(now),
        chapter,
      )
      .toArray();
    return rows.map((row, index) => ({
      id: `weekly-${chapter}-${index + 1}`,
      name: row.display_name,
      score: row.score,
      color: '#f1fa8c',
    }));
  }

  private sendLeaderboard(socket: DurableWebSocket, chapter: ChapterId): void {
    this.send(socket, 'leaderboard', {
      chapter,
      entries: this.leaderboard(chapter),
    });
  }

  private broadcastLeaderboard(chapter: ChapterId): void {
    this.broadcastChapter(chapter, 'leaderboard', {
      chapter,
      entries: this.leaderboard(chapter),
    });
  }

  private migrateDatabase(): void {
    this.state.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS weekly_scores (
        week_start TEXT NOT NULL,
        chapter INTEGER NOT NULL CHECK (chapter BETWEEN 3 AND 10),
        profile_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        score INTEGER NOT NULL CHECK (score >= 0),
        achieved_at TEXT NOT NULL,
        PRIMARY KEY (week_start, chapter, profile_hash)
      );
      CREATE INDEX IF NOT EXISTS weekly_scores_leaderboard_idx
        ON weekly_scores (
          week_start, chapter, score DESC, achieved_at ASC, profile_hash ASC
        );
    `);
  }
}

function validateApprovedQuestionIndex(value: unknown): QuestionWithAnswer[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('approved question index must be an object');
  }
  const index = value as Record<string, unknown>;
  if (
    index.schemaVersion !== 1 ||
    typeof index.questionCount !== 'number' ||
    !Number.isInteger(index.questionCount) ||
    typeof index.checksum !== 'string' ||
    !/^sha256:[a-f0-9]{64}$/.test(index.checksum)
  ) {
    throw new Error('approved question index metadata is invalid');
  }
  const questions = QuestionBankSchema.parse(index.questions);
  if (index.questionCount !== questions.length) {
    throw new Error('approved question index count does not match its questions');
  }
  if (questions.some((question) => question.status !== 'approved')) {
    throw new Error('Cloudflare runtime question index may contain approved questions only');
  }
  return questions;
}

function parseConnectionAttachment(value: unknown): ConnectionAttachment | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.connectionId !== 'string' || candidate.connectionId.length > 100) {
    return null;
  }
  if (candidate.joined === undefined) return { connectionId: candidate.connectionId };
  const joined = JoinPayloadSchema.safeParse(candidate.joined);
  return joined.success
    ? { connectionId: candidate.connectionId, joined: joined.data as JoinPayload }
    : null;
}

function attachmentFor(connection: Connection): ConnectionAttachment {
  return connection.joined
    ? { connectionId: connection.connectionId, joined: connection.joined }
    : { connectionId: connection.connectionId };
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}
