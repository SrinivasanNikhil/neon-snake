import { describe, expect, it } from 'vitest';
import { SocketRateLimiter } from './rateLimit';

describe('SocketRateLimiter', () => {
  it('limits an event within its window and resets after the window', () => {
    const limiter = new SocketRateLimiter({ input: { maximum: 2, windowMs: 1_000 } });
    expect(limiter.allow('input', 0)).toBe(true);
    expect(limiter.allow('input', 100)).toBe(true);
    expect(limiter.allow('input', 200)).toBe(false);
    expect(limiter.allow('input', 1_000)).toBe(true);
  });
});
