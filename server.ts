/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { existsSync, mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import type {
  ClientToServerEvents,
  InterServerEvents,
  ServerToClientEvents,
  SocketData,
} from './src/shared/protocol.ts';
import type { ChapterId, LeaderboardEntry } from './src/shared/types.ts';
import { ArenaManager, type EndedRun } from './src/server/arena/ArenaManager.ts';
import { openDatabase } from './src/server/db/database.ts';
import { LeaderboardRepository } from './src/server/repositories/leaderboardRepository.ts';
import { loadApprovedQuestions } from './src/server/questions/approvedQuestionLoader.ts';
import { QuestionService } from './src/server/questions/questionService.ts';
import {
  registerRealtimeHandlers,
  startGameLoop,
} from './src/server/socket/registerHandlers.ts';

const host = process.env.HOST ?? '0.0.0.0';
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const databasePath = process.env.DATABASE_PATH ?? './data/neon-snake.sqlite';
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3000')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!Number.isInteger(port) || port < 0 || port > 65_535) {
  throw new Error('PORT must be an integer from 0 through 65535');
}

if (databasePath !== ':memory:') mkdirSync(path.dirname(databasePath), { recursive: true });

const database = openDatabase(databasePath);
const leaderboardRepository = new LeaderboardRepository(database);
const approvedQuestions = loadApprovedQuestions();
const arenas = new ArenaManager(new QuestionService(undefined, Math.random, approvedQuestions));
const app = express();
app.disable('x-powered-by');
const httpServer = createServer(app);
const io = new Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
>(httpServer, {
  cors: {
    origin: process.env.NODE_ENV === 'production' ? allowedOrigins : true,
  },
  maxHttpBufferSize: 16 * 1024,
});

function leaderboardForChapter(chapter: ChapterId): LeaderboardEntry[] {
  return leaderboardRepository.topTen(chapter).map((entry, index) => ({
    id: `weekly-${chapter}-${index + 1}`,
    name: entry.displayName,
    score: entry.score,
    color: '#f1fa8c',
  }));
}

const realtimeOptions = {
  onRunEnded: (ended: EndedRun) => {
    leaderboardRepository.recordWeeklyBest({
      browserProfileId: ended.profileId,
      displayName: ended.displayName,
      chapter: ended.summary.chapter,
      score: Math.max(0, Math.floor(ended.summary.score)),
    });
  },
  getLeaderboard: leaderboardForChapter,
};

registerRealtimeHandlers(io, arenas, realtimeOptions);
const gameLoop = startGameLoop(io, arenas, realtimeOptions);

let ready = false;
let shuttingDown = false;

app.get('/api/health/live', (_request, response) => {
  response.json({ status: 'ok' });
});

app.get('/api/health/ready', (_request, response) => {
  if (!ready || shuttingDown) {
    response.status(503).json({ status: 'not-ready' });
    return;
  }
  try {
    database.prepare('SELECT 1').get();
    response.json({ status: 'ready' });
  } catch {
    response.status(503).json({ status: 'not-ready' });
  }
});

app.get('/api/health', (_request, response) => {
  response.json({ status: ready && !shuttingDown ? 'ok' : 'starting' });
});

async function startServer(): Promise<void> {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const root = path.dirname(fileURLToPath(import.meta.url));
    const adjacentDist = path.join(root, 'dist');
    const distPath = existsSync(adjacentDist) ? adjacentDist : path.resolve(root, '..', 'dist');
    app.use(express.static(distPath));
    app.get('*', (_request, response) => response.sendFile(path.join(distPath, 'index.html')));
  }

  httpServer.listen(port, host, () => {
    ready = true;
    console.log(`Server running on http://${host}:${port}`);
  });
}

function shutdown(): void {
  if (shuttingDown) return;
  shuttingDown = true;
  ready = false;
  gameLoop.stop();
  io.close(() => {
    httpServer.close(() => {
      database.close();
    });
  });
}

process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

startServer().catch((cause) => {
  console.error('Server failed to start', cause);
  shutdown();
  process.exitCode = 1;
});
