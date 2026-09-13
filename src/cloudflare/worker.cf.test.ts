/// <reference types="@cloudflare/workers-types" />

import { exports } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { encodeClientMessage, parseServerMessage } from '../shared/realtimeProtocol';

declare global {
  namespace Cloudflare {
    interface GlobalProps {
      mainModule: typeof import('./worker');
      durableNamespaces: 'NeonSnakeClassroom';
    }
  }
}

describe('Cloudflare Worker runtime', () => {
  it('serves the health endpoint through the Worker entry point', async () => {
    const response = await exports.default.fetch(
      new Request('https://neon-snake.test/api/health'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: 'ok' });
  });

  it('requires a WebSocket upgrade for the realtime endpoint', async () => {
    const response = await exports.default.fetch(
      new Request('https://neon-snake.test/api/realtime'),
    );

    expect(response.status).toBe(426);
  });

  it('upgrades a WebSocket and reads the SQLite-backed leaderboard', async () => {
    const response = await exports.default.fetch(
      new Request('https://neon-snake.test/api/realtime', {
        headers: {
          Origin: 'https://neon-snake.test',
          Upgrade: 'websocket',
        },
      }),
    );
    const socket = response.webSocket;

    expect(response.status).toBe(101);
    expect(socket).not.toBeNull();
    socket!.accept();

    const nextMessage = new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Timed out waiting for the leaderboard.')),
        2_000,
      );
      socket!.addEventListener('message', (event) => {
        clearTimeout(timeout);
        resolve(String(event.data));
      }, { once: true });
    });

    socket!.send(encodeClientMessage('request_leaderboard', { chapter: 3 }));
    const parsed = parseServerMessage(await nextMessage);

    expect(parsed).toEqual({
      ok: true,
      message: {
        event: 'leaderboard',
        payload: { chapter: 3, entries: [] },
      },
    });
    socket!.close(1000, 'Test complete');
  });
});
