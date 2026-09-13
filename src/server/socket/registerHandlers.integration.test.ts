import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { Server } from 'socket.io';
import { io as createClient, type Socket } from 'socket.io-client';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from '../../shared/protocol';
import { GAME_CONFIG } from '../../shared/gameConfig';
import { QUESTIONS } from '../../shared/questions';
import { ArenaManager } from '../arena/ArenaManager';
import {
  registerRealtimeHandlers,
  startGameLoop,
  type GameLoop,
  type GameSocketServer,
  type RealtimeHandlersOptions,
} from './registerHandlers';

const PROFILE_ID = '4f5fa847-e21b-42b4-9b54-f67ca92462c7';
const EVENT_TIMEOUT_MS = 1_000;

type TestClient = Socket<ServerToClientEvents, ClientToServerEvents>;

type TestRuntime = {
  httpServer: HttpServer;
  io: GameSocketServer;
  arenas: ArenaManager;
  loop: GameLoop;
  address: string;
  clients: TestClient[];
};

const runtimes: TestRuntime[] = [];

afterEach(async () => {
  await Promise.all(runtimes.splice(0).map(closeRuntime));
});

async function createRuntime(
  options: RealtimeHandlersOptions = {},
): Promise<TestRuntime> {
  const httpServer = createServer();
  const io = new Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >(httpServer, { transports: ['websocket'] });
  const arenas = new ArenaManager(undefined, () => 0.5);
  registerRealtimeHandlers(io, arenas, options);
  const loop = startGameLoop(io, arenas, options);
  // Tests drive snapshots explicitly; stopping prevents simulation ticks from
  // mutating a newly joined snake while network assertions are in flight.
  loop.stop();

  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  const port = (httpServer.address() as AddressInfo).port;
  const runtime = {
    httpServer,
    io,
    arenas,
    loop,
    address: `http://127.0.0.1:${port}`,
    clients: [],
  };
  runtimes.push(runtime);
  return runtime;
}

async function connect(runtime: TestRuntime): Promise<TestClient> {
  const client: TestClient = createClient(runtime.address, {
    autoConnect: false,
    forceNew: true,
    transports: ['websocket'],
  });
  runtime.clients.push(client);
  const connected = onceConnected(client);
  client.connect();
  await connected;
  return client;
}

function onceConnected(client: TestClient): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off('connect', onConnect);
      reject(new Error('Timed out waiting for connect'));
    }, EVENT_TIMEOUT_MS);
    const onConnect = () => {
      clearTimeout(timeout);
      resolve();
    };
    client.once('connect', onConnect);
  });
}

function join(client: TestClient, chapter: 3 | 4 = 3, suffix = ''): void {
  client.emit('join', {
    profileId: PROFILE_ID.replace('7', suffix || '7'),
    name: `Snake ${suffix || 'A'}`,
    chapter,
    difficulty: 1,
  });
}

function once<TEvent extends keyof ServerToClientEvents>(
  client: TestClient,
  event: TEvent,
): Promise<Parameters<ServerToClientEvents[TEvent]>[0]> {
  const untypedClient = client as unknown as {
    once: (event: string, listener: (payload: unknown) => void) => void;
    off: (event: string, listener: (payload: unknown) => void) => void;
  };
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      untypedClient.off(event, handler);
      reject(new Error(`Timed out waiting for ${String(event)}`));
    }, EVENT_TIMEOUT_MS);
    const handler = (payload: unknown) => {
      clearTimeout(timeout);
      resolve(payload as Parameters<ServerToClientEvents[TEvent]>[0]);
    };
    untypedClient.once(event, handler);
  });
}

async function closeRuntime(runtime: TestRuntime): Promise<void> {
  runtime.loop.stop();
  for (const client of runtime.clients) client.disconnect();
  await new Promise<void>((resolve) => runtime.io.close(() => resolve()));
  if (runtime.httpServer.listening) {
    await new Promise<void>((resolve) => runtime.httpServer.close(() => resolve()));
  }
}

async function waitFor(predicate: () => boolean): Promise<void> {
  const deadline = Date.now() + EVENT_TIMEOUT_MS;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('Timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe('Socket.IO realtime handlers', () => {
  it('serves chapter leaderboards before a player joins an arena', async () => {
    const runtime = await createRuntime({
      getLeaderboard: (chapter) => chapter === 4
        ? [{ id: 'weekly-4-1', name: 'Ada', score: 88, color: '#f1fa8c' }]
        : [],
    });
    const client = await connect(runtime);

    const leaderboard = once(client, 'leaderboard');
    client.emit('request_leaderboard', { chapter: 4 });
    await expect(leaderboard).resolves.toEqual({
      chapter: 4,
      entries: [{ id: 'weekly-4-1', name: 'Ada', score: 88, color: '#f1fa8c' }],
    });
    expect(runtime.arenas.getPlayer(client.id)).toBeUndefined();

    const rejected = once(client, 'error_message');
    client.emit('request_leaderboard', { chapter: 2 as 3 });
    await expect(rejected).resolves.toMatchObject({
      code: 'invalid_leaderboard_request',
    });
  });

  it('initializes valid joins and shares snapshots only with the selected chapter room', async () => {
    const runtime = await createRuntime();
    const chapterThreeA = await connect(runtime);
    const initA = once(chapterThreeA, 'init');
    const initialSnapshotA = once(chapterThreeA, 'snapshot');
    join(chapterThreeA, 3, '1');
    await expect(initA).resolves.toMatchObject({ playerId: expect.any(String), chapter: 3, tick: 0 });
    await expect(initialSnapshotA).resolves.toMatchObject({ chapter: 3 });

    const chapterThreeB = await connect(runtime);
    const initB = once(chapterThreeB, 'init');
    join(chapterThreeB, 3, '2');
    await expect(initB).resolves.toMatchObject({ chapter: 3 });

    const chapterFour = await connect(runtime);
    const initC = once(chapterFour, 'init');
    join(chapterFour, 4, '3');
    await expect(initC).resolves.toMatchObject({ chapter: 4 });

    const snapshotA = once(chapterThreeA, 'snapshot');
    const snapshotB = once(chapterThreeB, 'snapshot');
    const snapshotC = once(chapterFour, 'snapshot');
    runtime.loop.snapshotNow();
    const [a, b, c] = await Promise.all([snapshotA, snapshotB, snapshotC]);

    expect(Object.keys(a.players)).toHaveLength(2);
    expect(Object.keys(b.players)).toHaveLength(2);
    expect(Object.keys(c.players)).toHaveLength(1);
    expect(a.chapter).toBe(3);
    expect(c.chapter).toBe(4);
  });

  it('rejects malformed joins without creating a player', async () => {
    const runtime = await createRuntime();
    const client = await connect(runtime);
    const rejected = once(client, 'error_message');
    (client.emit as unknown as (event: string, payload: unknown) => void).call(client, 'join', {
      profileId: 'not-a-uuid',
      name: '',
      chapter: 99,
    });

    await expect(rejected).resolves.toMatchObject({ code: 'invalid_join' });
    expect(runtime.arenas.getPlayer(client.id)).toBeUndefined();
  });

  it('does not accept legacy state or orb collection commands from clients', async () => {
    const runtime = await createRuntime();
    const client = await connect(runtime);
    const initialized = once(client, 'init');
    join(client, 3, '4');
    await initialized;
    const player = runtime.arenas.getPlayer(client.id)!;
    const score = player.score;
    const segments = player.segments.map((segment) => ({ ...segment }));

    const emitLegacy = client.emit as unknown as (event: string, payload: unknown) => void;
    emitLegacy.call(client, 'update_state', { score: 999_999, segments: [{ x: 999, y: 999 }] });
    emitLegacy.call(client, 'collect_orb', 'any-orb-id');
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(player.score).toBe(score);
    expect(player.segments).toEqual(segments);
  });

  it('removes a disconnected player from its arena', async () => {
    const runtime = await createRuntime();
    const client = await connect(runtime);
    const initialized = once(client, 'init');
    join(client, 3, '5');
    await initialized;
    const playerId = client.id;
    expect(runtime.arenas.getPlayer(playerId)).toBeDefined();

    client.disconnect();
    await waitFor(() => runtime.arenas.getPlayer(playerId) === undefined);
    expect(runtime.arenas.snapshot(3).players).toEqual({});
  });

  it('issues a protected server-owned quiz and resumes only after a valid answer', async () => {
    const runtime = await createRuntime();
    const client = await connect(runtime);
    const initialized = once(client, 'init');
    join(client, 3, '6');
    await initialized;
    const player = runtime.arenas.getPlayer(client.id)!;
    player.orbsSinceQuiz = GAME_CONFIG.quizOrbInterval - 1;
    runtime.arenas.getArena(3)!.orbs = {
      quiz: {
        id: 'quiz',
        x: player.segments[0].x,
        y: player.segments[0].y,
        value: 1,
        color: '#fff',
      },
    };

    const triggered = once(client, 'trigger_quiz');
    runtime.loop.tickNow();
    const question = await triggered;
    expect(question.chapter).toBe(3);
    expect(question).not.toHaveProperty('correctOptionId');
    expect(player.state).toBe('quiz');

    client.emit('continue_after_quiz');
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(player.state).toBe('quiz');

    const legacyQuestion = QUESTIONS.find(
      ({ id }) => `legacy-${id}` === question.questionId,
    )!;
    const resultPromise = once(client, 'quiz_result');
    client.emit('submit_answer', {
      attemptId: question.attemptId,
      optionId: String.fromCharCode(97 + legacyQuestion.correctAnswer),
    });
    await expect(resultPromise).resolves.toMatchObject({ success: true, scoreDelta: 10 });
    expect(player.state).toBe('quiz');

    client.emit('continue_after_quiz');
    await waitFor(() => player.state === 'alive');
  });

  it('emits one run-ended event for authoritative self-collision without orb drops', async () => {
    const runtime = await createRuntime();
    const client = await connect(runtime);
    const initialized = once(client, 'init');
    join(client, 3, '7');
    await initialized;
    const player = runtime.arenas.getPlayer(client.id)!;
    const loop = [
      { x: 0, y: 0 },
      { x: -0.5, y: 0 },
      { x: -0.5, y: 0.5 },
      { x: 0, y: 0.5 },
      { x: 0.5, y: 0.5 },
      { x: 0.5, y: 0 },
    ];
    player.targetLength = GAME_CONFIG.selfCollisionMinimumLength;
    player.segments = Array.from(
      { length: GAME_CONFIG.selfCollisionMinimumLength },
      (_, index) => loop[index] ?? { x: 0.5 + (index - loop.length + 1) * 0.5, y: 0 },
    );
    player.score = 73;
    const orbCount = Object.keys(runtime.arenas.getArena(3)!.orbs).length;

    const ended = once(client, 'run_ended');
    runtime.loop.tickNow(new Date('2026-08-11T12:00:00.000Z'));
    await expect(ended).resolves.toMatchObject({
      chapter: 3,
      score: 73,
      endedBy: 'self_collision',
    });
    expect(player.state).toBe('dead');
    expect(Object.keys(runtime.arenas.getArena(3)!.orbs)).toHaveLength(orbCount);

    let duplicateEvents = 0;
    client.on('run_ended', () => duplicateEvents += 1);
    runtime.loop.tickNow(new Date('2026-08-11T12:00:01.000Z'));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(duplicateEvents).toBe(0);
  });

  it('emits and ranks one server-authoritative internal-hazard collision', async () => {
    const recordedRuns: string[] = [];
    const runtime = await createRuntime({
      onRunEnded: ({ summary }) => recordedRuns.push(summary.endedBy),
      getLeaderboard: (chapter) => [{
        id: `weekly-${chapter}-1`,
        name: 'Hazard Tester',
        score: 41,
        color: '#f1fa8c',
      }],
    });
    const client = await connect(runtime);
    const initialized = once(client, 'init');
    join(client, 3, '8');
    await initialized;

    const arena = runtime.arenas.getArena(3)!;
    const player = runtime.arenas.getPlayer(client.id)!;
    const hazard = Object.values(arena.hazards)[0];
    arena.hazardsActive = true;
    arena.hazardActivatedAtTick = 0;
    arena.tick = Math.ceil(
      GAME_CONFIG.hazardActivationGraceSeconds * GAME_CONFIG.simulationRate,
    );
    player.effects.hazardProtectionRemaining = 0;
    player.segments = player.segments.map((segment, index) => ({
      x: hazard.x - index * GAME_CONFIG.segmentSpacing,
      y: hazard.y,
    }));
    player.score = 41;
    const orbCount = Object.keys(arena.orbs).length;

    const ended = once(client, 'run_ended');
    const leaderboard = once(client, 'leaderboard');
    runtime.loop.tickNow(new Date('2026-08-15T12:00:00.000Z'));

    await expect(ended).resolves.toMatchObject({
      chapter: 3,
      score: 41,
      endedBy: 'hazard_collision',
    });
    await expect(leaderboard).resolves.toMatchObject({
      chapter: 3,
      entries: [expect.objectContaining({ name: 'Hazard Tester', score: 41 })],
    });
    expect(recordedRuns).toEqual(['hazard_collision']);
    expect(player.state).toBe('dead');
    expect(Object.keys(arena.orbs)).toHaveLength(orbCount);

    runtime.loop.tickNow(new Date('2026-08-15T12:00:01.000Z'));
    expect(recordedRuns).toEqual(['hazard_collision']);
  });
});
