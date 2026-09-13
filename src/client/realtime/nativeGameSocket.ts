/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type {
  ClientToServerEvents,
  ProtocolError,
  ServerToClientEvents,
} from '../../shared/protocol';
import {
  encodeClientMessage,
  parseServerMessage,
} from '../../shared/realtimeProtocol';

type LifecycleEvents = {
  connect: () => void;
  connect_error: (error: Error) => void;
  disconnect: () => void;
};

type EventHandler = (...args: never[]) => void;

export interface GameSocket {
  readonly connected: boolean;
  connect: () => GameSocket;
  disconnect: () => GameSocket;
  reconnect: () => GameSocket;
  emit<Event extends keyof ClientToServerEvents>(
    event: Event,
    ...args: Parameters<ClientToServerEvents[Event]>
  ): GameSocket;
  on<Event extends keyof ServerToClientEvents>(
    event: Event,
    handler: ServerToClientEvents[Event],
  ): GameSocket;
  on<Event extends keyof LifecycleEvents>(
    event: Event,
    handler: LifecycleEvents[Event],
  ): GameSocket;
}

interface WebSocketLike {
  readyState: number;
  onopen: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onclose: ((event: CloseEvent) => void) | null;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type RealtimeSocketOptions = {
  url?: string;
  autoConnect?: boolean;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  webSocketFactory?: (url: string) => WebSocketLike;
};

const OPEN = 1;
const CONNECTING = 0;

export function realtimeUrl(locationLike?: Pick<Location, 'origin'>): string {
  const origin = locationLike?.origin
    ?? (typeof window === 'undefined' ? 'http://localhost' : window.location.origin);
  const url = new URL('/api/realtime', origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}

export function createGameSocket(options: RealtimeSocketOptions = {}): GameSocket {
  return new NativeGameSocket(options);
}

class NativeGameSocket implements GameSocket {
  connected = false;

  private readonly url: string;
  private readonly reconnectBaseDelayMs: number;
  private readonly reconnectMaxDelayMs: number;
  private readonly webSocketFactory: (url: string) => WebSocketLike;
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private webSocket: WebSocketLike | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private generation = 0;
  private explicitlyClosed = false;

  constructor(options: RealtimeSocketOptions) {
    this.url = options.url ?? realtimeUrl();
    this.reconnectBaseDelayMs = Math.max(0, options.reconnectBaseDelayMs ?? 500);
    this.reconnectMaxDelayMs = Math.max(
      this.reconnectBaseDelayMs,
      options.reconnectMaxDelayMs ?? 8_000,
    );
    this.webSocketFactory = options.webSocketFactory
      ?? ((url) => new WebSocket(url));

    if (options.autoConnect !== false) this.connect();
  }

  connect(): GameSocket {
    if (
      this.webSocket?.readyState === CONNECTING
      || this.webSocket?.readyState === OPEN
    ) {
      return this;
    }

    this.explicitlyClosed = false;
    this.clearReconnectTimer();
    this.openWebSocket();
    return this;
  }

  disconnect(): GameSocket {
    this.explicitlyClosed = true;
    this.clearReconnectTimer();
    this.generation += 1;

    const webSocket = this.webSocket;
    const wasConnected = this.connected;
    this.webSocket = null;
    this.connected = false;
    webSocket?.close(1000, 'Client disconnected');
    if (wasConnected) this.dispatch('disconnect');
    return this;
  }

  reconnect(): GameSocket {
    this.disconnect();
    this.explicitlyClosed = false;
    this.reconnectAttempt = 0;
    return this.connect();
  }

  emit<Event extends keyof ClientToServerEvents>(
    event: Event,
    ...args: Parameters<ClientToServerEvents[Event]>
  ): GameSocket {
    if (!this.connected || this.webSocket?.readyState !== OPEN) return this;
    this.webSocket.send(encodeClientMessage(event, ...args));
    return this;
  }

  on<Event extends keyof ServerToClientEvents>(
    event: Event,
    handler: ServerToClientEvents[Event],
  ): GameSocket;
  on<Event extends keyof LifecycleEvents>(
    event: Event,
    handler: LifecycleEvents[Event],
  ): GameSocket;
  on(event: string, handler: EventHandler): GameSocket {
    const handlers = this.handlers.get(event) ?? new Set<EventHandler>();
    handlers.add(handler);
    this.handlers.set(event, handlers);
    return this;
  }

  private openWebSocket(): void {
    const generation = ++this.generation;
    let webSocket: WebSocketLike;

    try {
      webSocket = this.webSocketFactory(this.url);
    } catch (error) {
      this.signalConnectError(error);
      this.scheduleReconnect(generation);
      return;
    }

    this.webSocket = webSocket;
    let connectionErrorSignaled = false;

    webSocket.onopen = () => {
      if (generation !== this.generation) return;
      this.connected = true;
      this.reconnectAttempt = 0;
      this.dispatch('connect');
    };

    webSocket.onmessage = (message) => {
      if (generation !== this.generation) return;
      this.handleMessage(message.data);
    };

    webSocket.onerror = () => {
      if (generation !== this.generation || this.connected) return;
      connectionErrorSignaled = true;
      this.signalConnectError(new Error('Unable to connect to the game server.'));
    };

    webSocket.onclose = () => {
      if (generation !== this.generation) return;
      const wasConnected = this.connected;
      this.connected = false;
      this.webSocket = null;

      if (wasConnected) {
        this.dispatch('disconnect');
      } else if (!connectionErrorSignaled && !this.explicitlyClosed) {
        this.signalConnectError(new Error('Unable to connect to the game server.'));
      }

      if (!this.explicitlyClosed) this.scheduleReconnect(generation);
    };
  }

  private handleMessage(data: unknown): void {
    if (typeof data !== 'string') {
      this.signalProtocolError('The game server sent an unsupported message.');
      return;
    }

    const parsed = parseServerMessage(data);
    if (parsed.ok === false) {
      const message = parsed.error === 'unknown_event'
        ? 'The game server sent an unknown event.'
        : 'The game server sent malformed data.';
      this.signalProtocolError(message);
      return;
    }

    this.dispatch(parsed.message.event, parsed.message.payload);
  }

  private signalProtocolError(message: string): void {
    const error: ProtocolError = { code: 'invalid_server_message', message };
    this.dispatch('error_message', error);
  }

  private signalConnectError(error: unknown): void {
    this.dispatch(
      'connect_error',
      error instanceof Error ? error : new Error('Unable to connect to the game server.'),
    );
  }

  private scheduleReconnect(generation: number): void {
    if (this.explicitlyClosed || generation !== this.generation) return;
    const delay = Math.min(
      this.reconnectBaseDelayMs * (2 ** this.reconnectAttempt),
      this.reconnectMaxDelayMs,
    );
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.explicitlyClosed && generation === this.generation) {
        this.openWebSocket();
      }
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private dispatch(event: string, ...args: unknown[]): void {
    for (const handler of this.handlers.get(event) ?? []) {
      (handler as (...handlerArgs: unknown[]) => void)(...args);
    }
  }
}
