export interface RateLimitOptions {
  /** sustained requests per minute */
  perMinute: number;
  /** instantaneous burst allowance */
  burst: number;
  now?: () => number;
}

export interface RateLimitResult {
  ok: boolean;
  /** seconds until a token is available (when !ok) */
  retryAfter: number;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

/**
 * In-memory token bucket per key (client IP). Serverless caveat: state is
 * per-instance, so the effective global limit scales with instance count —
 * acceptable as an abuse brake for v1.
 */
export function createRateLimiter(opts: RateLimitOptions) {
  const now = opts.now ?? Date.now;
  const refillPerMs = opts.perMinute / 60_000;
  const buckets = new Map<string, Bucket>();

  return function check(key: string): RateLimitResult {
    const t = now();
    const bucket = buckets.get(key) ?? { tokens: opts.burst, updatedAt: t };
    bucket.tokens = Math.min(
      opts.burst,
      bucket.tokens + (t - bucket.updatedAt) * refillPerMs,
    );
    bucket.updatedAt = t;

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      buckets.set(key, bucket);
      return { ok: true, retryAfter: 0 };
    }
    buckets.set(key, bucket);
    return {
      ok: false,
      retryAfter: Math.ceil((1 - bucket.tokens) / refillPerMs / 1000),
    };
  };
}
