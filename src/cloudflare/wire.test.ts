import { describe, expect, it } from 'vitest';
import {
  MAX_WEBSOCKET_MESSAGE_BYTES,
  isAllowedOrigin,
  isMessageWithinLimit,
} from './wire';

describe('Cloudflare WebSocket boundary helpers', () => {
  it('enforces the frame limit in UTF-8 bytes', () => {
    expect(isMessageWithinLimit('x'.repeat(MAX_WEBSOCKET_MESSAGE_BYTES))).toBe(true);
    expect(isMessageWithinLimit('x'.repeat(MAX_WEBSOCKET_MESSAGE_BYTES + 1))).toBe(false);
    expect(isMessageWithinLimit('€'.repeat(6_000))).toBe(false);
  });

  it('allows only same-origin or explicitly configured browser origins', () => {
    const requestUrl = 'https://snake.example/api/realtime';
    expect(isAllowedOrigin(requestUrl, 'https://snake.example')).toBe(true);
    expect(isAllowedOrigin(requestUrl, 'https://class.example', 'https://class.example')).toBe(true);
    expect(isAllowedOrigin(requestUrl, 'https://attacker.example')).toBe(false);
    expect(isAllowedOrigin(requestUrl, null)).toBe(false);
  });
});
