import { describe, expect, it } from 'vitest';
import {
  encodeClientMessage,
  encodeServerMessage,
  parseClientMessage,
  parseServerMessage,
} from './realtimeProtocol';

describe('realtime WebSocket protocol', () => {
  it('encodes a typed client event in the shared envelope', () => {
    const encoded = encodeClientMessage('input', {
      sequence: 12,
      left: true,
      right: false,
      boost: false,
    });

    expect(JSON.parse(encoded)).toEqual({
      event: 'input',
      payload: { sequence: 12, left: true, right: false, boost: false },
    });
  });

  it('uses null for events with no payload', () => {
    const encoded = encodeClientMessage('continue_after_quiz');

    expect(JSON.parse(encoded)).toEqual({
      event: 'continue_after_quiz',
      payload: null,
    });
    expect(parseClientMessage(encoded)).toEqual({
      ok: true,
      message: { event: 'continue_after_quiz', payload: null },
    });
  });

  it('parses known server events without trusting their payload', () => {
    const encoded = encodeServerMessage('error_message', {
      code: 'invalid_message',
      message: 'The message could not be processed.',
    });

    expect(parseServerMessage(encoded)).toEqual({
      ok: true,
      message: {
        event: 'error_message',
        payload: {
          code: 'invalid_message',
          message: 'The message could not be processed.',
        },
      },
    });
  });

  it.each([
    ['not JSON', 'invalid_json'],
    ['null', 'invalid_envelope'],
    ['{"event":"join"}', 'invalid_envelope'],
    ['{"event":"join","payload":{},"extra":true}', 'invalid_envelope'],
    ['{"event":"not_an_event","payload":null}', 'unknown_event'],
    ['{"event":"continue_after_quiz","payload":{}}', 'invalid_payload'],
  ])('rejects %s with %s', (raw, error) => {
    expect(parseClientMessage(raw)).toEqual({ ok: false, error });
  });

  it('does not allow a client-only event from the server', () => {
    expect(parseServerMessage('{"event":"join","payload":{}}')).toEqual({
      ok: false,
      error: 'unknown_event',
    });
  });
});
