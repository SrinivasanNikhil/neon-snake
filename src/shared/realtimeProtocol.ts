import type { ClientToServerEvents, ServerToClientEvents } from './protocol';

type EventName<TEvents> = Extract<keyof TEvents, string>;
type EventArguments<
  TEvents,
  TEvent extends EventName<TEvents>,
> = TEvents[TEvent] extends (...args: infer TArgs) => unknown ? TArgs : never;

type WirePayload<
  TEvents,
  TEvent extends EventName<TEvents>,
> = EventArguments<TEvents, TEvent> extends []
  ? null
  : EventArguments<TEvents, TEvent> extends [infer TPayload]
    ? TPayload
    : never;

export type RealtimeEnvelope<TEvents> = {
  [TEvent in EventName<TEvents>]: {
    event: TEvent;
    payload: WirePayload<TEvents, TEvent>;
  };
}[EventName<TEvents>];

export type ParsedRealtimeEnvelope<TEvents> = {
  [TEvent in EventName<TEvents>]: {
    event: TEvent;
    /**
     * The envelope parser validates the wire format and event name only. Each
     * event handler must validate this untrusted payload before using it.
     */
    payload: unknown;
  };
}[EventName<TEvents>];

export type RealtimeParseErrorCode =
  | 'invalid_json'
  | 'invalid_envelope'
  | 'unknown_event'
  | 'invalid_payload';

export type RealtimeParseResult<TEvents> =
  | { ok: true; message: ParsedRealtimeEnvelope<TEvents> }
  | { ok: false; error: RealtimeParseErrorCode };

const clientEvents = {
  join: true,
  request_leaderboard: true,
  input: true,
  submit_answer: true,
  continue_after_quiz: true,
} as const satisfies Record<EventName<ClientToServerEvents>, true>;

const serverEvents = {
  init: true,
  snapshot: true,
  trigger_quiz: true,
  quiz_result: true,
  run_ended: true,
  leaderboard: true,
  error_message: true,
} as const satisfies Record<EventName<ServerToClientEvents>, true>;

export const clientEventNames = Object.keys(clientEvents) as Array<
  EventName<ClientToServerEvents>
>;

export const serverEventNames = Object.keys(serverEvents) as Array<
  EventName<ServerToClientEvents>
>;

function encodeMessage(event: string, args: readonly unknown[]): string {
  const payload = args.length === 0 ? null : args[0];
  return JSON.stringify({ event, payload });
}

export function encodeClientMessage<TEvent extends EventName<ClientToServerEvents>>(
  event: TEvent,
  ...args: Parameters<ClientToServerEvents[TEvent]>
): string {
  return encodeMessage(event, args);
}

export function encodeServerMessage<TEvent extends EventName<ServerToClientEvents>>(
  event: TEvent,
  ...args: Parameters<ServerToClientEvents[TEvent]>
): string {
  return encodeMessage(event, args);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseMessage<TEvents>(
  raw: string,
  allowedEvents: readonly EventName<TEvents>[],
  noPayloadEvents: readonly EventName<TEvents>[] = [],
): RealtimeParseResult<TEvents> {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid_json' };
  }

  if (!isRecord(value)) {
    return { ok: false, error: 'invalid_envelope' };
  }

  const keys = Object.keys(value);
  if (
    keys.length !== 2
    || !Object.hasOwn(value, 'event')
    || !Object.hasOwn(value, 'payload')
    || typeof value.event !== 'string'
  ) {
    return { ok: false, error: 'invalid_envelope' };
  }

  if (!allowedEvents.includes(value.event as EventName<TEvents>)) {
    return { ok: false, error: 'unknown_event' };
  }

  if (
    noPayloadEvents.includes(value.event as EventName<TEvents>)
    && value.payload !== null
  ) {
    return { ok: false, error: 'invalid_payload' };
  }

  return {
    ok: true,
    message: value as ParsedRealtimeEnvelope<TEvents>,
  };
}

export function parseClientMessage(raw: string): RealtimeParseResult<ClientToServerEvents> {
  return parseMessage<ClientToServerEvents>(raw, clientEventNames, ['continue_after_quiz']);
}

export function parseServerMessage(raw: string): RealtimeParseResult<ServerToClientEvents> {
  return parseMessage<ServerToClientEvents>(raw, serverEventNames);
}
