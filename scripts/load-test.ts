import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '../src/shared/protocol';
import { CHAPTER_IDS } from '../src/shared/gameConfig';

const target = process.env.LOAD_TEST_URL ?? 'http://127.0.0.1:3210';
const clientCount = Number.parseInt(process.env.LOAD_TEST_CLIENTS ?? '24', 10);
const durationMs = Number.parseInt(process.env.LOAD_TEST_DURATION_MS ?? '3000', 10);

if (!Number.isInteger(clientCount) || clientCount < 1 || clientCount > 100) {
  throw new Error('LOAD_TEST_CLIENTS must be an integer from 1 through 100');
}

type TestSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type TestClient = { socket: TestSocket; snapshots: number; inputTimer?: ReturnType<typeof setInterval> };

function connectClient(index: number): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const socket: TestSocket = io(target, {
      transports: ['websocket'],
      reconnection: false,
      timeout: 5_000,
    });
    const client: TestClient = { socket, snapshots: 0 };
    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error(`client ${index} did not initialize`));
    }, 7_500);

    socket.on('connect_error', reject);
    socket.on('snapshot', () => {
      client.snapshots += 1;
    });
    socket.once('init', () => {
      clearTimeout(timeout);
      let sequence = 0;
      client.inputTimer = setInterval(() => {
        sequence += 1;
        socket.emit('input', {
          sequence,
          left: index % 2 === 0,
          right: index % 2 !== 0,
          boost: sequence % 30 < 10,
        });
      }, 40);
      resolve(client);
    });
    socket.on('connect', () => {
      socket.emit('join', {
        profileId: randomUUID(),
        name: `Load Tester ${index + 1}`,
        chapter: CHAPTER_IDS[index % CHAPTER_IDS.length],
        difficulty: 1,
      });
    });
  });
}

const startedAt = Date.now();
const clients = await Promise.all(Array.from({ length: clientCount }, (_, index) => connectClient(index)));
await new Promise((resolve) => setTimeout(resolve, durationMs));

for (const client of clients) {
  if (client.inputTimer) clearInterval(client.inputTimer);
  client.socket.disconnect();
}

const clientsWithoutSnapshots = clients.filter(({ snapshots }) => snapshots === 0).length;
const totalSnapshots = clients.reduce((sum, { snapshots }) => sum + snapshots, 0);
if (clientsWithoutSnapshots > 0) {
  throw new Error(`${clientsWithoutSnapshots} clients received no authoritative snapshots`);
}

console.log(JSON.stringify({
  target,
  clients: clientCount,
  durationMs: Date.now() - startedAt,
  totalSnapshots,
  averageSnapshotsPerClient: Math.round(totalSnapshots / clientCount),
}));
