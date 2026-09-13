export type RateLimitRule = {
  maximum: number;
  windowMs: number;
};

type Bucket = {
  count: number;
  windowStartedAt: number;
};

export class SocketRateLimiter {
  private readonly buckets = new Map<string, Bucket>();

  constructor(private readonly rules: Record<string, RateLimitRule>) {}

  allow(key: string, now = Date.now()): boolean {
    const rule = this.rules[key];
    if (!rule) return true;
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.windowStartedAt >= rule.windowMs) {
      this.buckets.set(key, { count: 1, windowStartedAt: now });
      return true;
    }
    if (bucket.count >= rule.maximum) return false;
    bucket.count += 1;
    return true;
  }
}
