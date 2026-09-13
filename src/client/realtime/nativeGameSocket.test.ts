/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createGameSocket, realtimeUrl } from './nativeGameSocket';

class FakeWebSocket {
  readyState = 0;
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  readonly sent: string[] = [];
  readonly closeCalls: Array<{ code?: number; reason?: string }> = [];

  open(): void {
    this.readyState = 1;
    this.onopen?.(new Event('open'));
  }

  receive(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  fail(): void {
    this.onerror?.(new Event('error'));
  }

  finishClose(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1006, reason: '', wasClean: false } as CloseEvent);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closeCalls.push({ code, reason });
    this.readyState = 2;
  }
}

afterEach(() => {
  vi.useRealTimers();
});

describe('native game WebSocket', () => {
  it('builds a same-origin realtime WebSocket URL', () => {
    expect(realtimeUrl({ origin: 'https://game.example' })).toBe(
      'wss://game.example/api/realtime',
    );
    expect(realtimeUrl({ origin: 'http://localhost:3000' })).toBe(
      'ws://localhost:3000/api/realtime',
    );
  });

  it('uses typed JSON envelopes in both directions', () => {
    const sockets: FakeWebSocket[] = [];
    const socket = createGameSocket({
      url: 'wss://game.example/api/realtime',
      webSocketFactory: () => {
        const webSocket = new FakeWebSocket();
        sockets.push(webSocket);
        return webSocket;
      },
    });
    const connected = vi.fn();
    const leaderboard = vi.fn();
    socket.on('connect', connected);
    socket.on('leaderboard', leaderboard);

    sockets[0].open();
    socket.emit('request_leaderboard', { chapter: 6 });
    socket.emit('continue_after_quiz');
    sockets[0].receive(JSON.stringify({
      event: 'leaderboard',
      payload: { chapter: 6, entries: [] },
    }));

    expect(socket.connected).toBe(true);
    expect(connected).toHaveBeenCalledOnce();
    expect(sockets[0].sent.map((message) => JSON.parse(message))).toEqual([
      { event: 'request_leaderboard', payload: { chapter: 6 } },
      { event: 'continue_after_quiz', payload: null },
    ]);
    expect(leaderboard).toHaveBeenCalledWith({ chapter: 6, entries: [] });
  });

  it('reports malformed, binary, and unknown server messages safely', () => {
    const webSocket = new FakeWebSocket();
    const socket = createGameSocket({
      webSocketFactory: () => webSocket,
    });
    const protocolError = vi.fn();
    socket.on('error_message', protocolError);
    webSocket.open();

    webSocket.receive('{bad json');
    webSocket.receive(new Uint8Array([1, 2, 3]));
    webSocket.receive(JSON.stringify({ event: 'not_an_event', payload: null }));

    expect(protocolError).toHaveBeenCalledTimes(3);
    expect(protocolError).toHaveBeenLastCalledWith({
      code: 'invalid_server_message',
      message: 'The game server sent an unknown event.',
    });
  });

  it('reconnects with backoff after an unexpected close', () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const socket = createGameSocket({
      reconnectBaseDelayMs: 25,
      reconnectMaxDelayMs: 100,
      webSocketFactory: () => {
        const webSocket = new FakeWebSocket();
        sockets.push(webSocket);
        return webSocket;
      },
    });
    const disconnected = vi.fn();
    socket.on('disconnect', disconnected);
    sockets[0].open();

    sockets[0].finishClose();
    expect(socket.connected).toBe(false);
    expect(disconnected).toHaveBeenCalledOnce();
    expect(sockets).toHaveLength(1);

    vi.advanceTimersByTime(25);
    expect(sockets).toHaveLength(2);
    sockets[1].open();
    expect(socket.connected).toBe(true);
  });

  it('reports a failed initial connection and retries', () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const socket = createGameSocket({
      reconnectBaseDelayMs: 20,
      webSocketFactory: () => {
        const webSocket = new FakeWebSocket();
        sockets.push(webSocket);
        return webSocket;
      },
    });
    const connectError = vi.fn();
    socket.on('connect_error', connectError);

    sockets[0].fail();
    sockets[0].finishClose();
    expect(connectError).toHaveBeenCalledOnce();
    expect(socket.connected).toBe(false);

    vi.advanceTimersByTime(20);
    expect(sockets).toHaveLength(2);
  });

  it('does not reconnect after an explicit disconnect', () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const socket = createGameSocket({
      reconnectBaseDelayMs: 10,
      webSocketFactory: () => {
        const webSocket = new FakeWebSocket();
        sockets.push(webSocket);
        return webSocket;
      },
    });
    sockets[0].open();

    socket.disconnect();
    sockets[0].finishClose();
    vi.advanceTimersByTime(1_000);

    expect(socket.connected).toBe(false);
    expect(sockets).toHaveLength(1);
    expect(sockets[0].closeCalls).toEqual([
      { code: 1000, reason: 'Client disconnected' },
    ]);
  });

  it('can reconnect immediately after an explicit disconnect', () => {
    const sockets: FakeWebSocket[] = [];
    const socket = createGameSocket({
      autoConnect: false,
      webSocketFactory: () => {
        const webSocket = new FakeWebSocket();
        sockets.push(webSocket);
        return webSocket;
      },
    });

    socket.connect();
    sockets[0].open();
    socket.reconnect();

    expect(socket.connected).toBe(false);
    expect(sockets).toHaveLength(2);
    sockets[1].open();
    expect(socket.connected).toBe(true);
  });
});
