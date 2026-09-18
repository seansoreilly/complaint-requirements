/**
 * Bounding what the paid endpoint will do for one caller.
 *
 * /api/chat calls a metered model. Nothing in the application stopped a caller
 * making requests as fast as they could open connections, each one allowed a
 * large output budget.
 *
 * What this is NOT: an authority. The counters live in the memory of one
 * server instance, and the platform reuses instances across concurrent
 * requests rather than guaranteeing a single one — so two instances keep two
 * buckets and a determined caller gets a multiple of the limit. It reduces
 * casual abuse and runaway loops; it does not enforce a global ceiling. The
 * real backstop is the spend limit on the API key itself, and anything
 * stronger belongs at the edge, in front of the function.
 */

export interface RateLimitResult {
  ok: boolean;
  /** Seconds to wait, when refused. */
  retryAfter: number;
  reason?: "rate" | "concurrency";
}

export interface RateLimitOptions {
  /** Requests allowed per window, per caller. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** How many requests may be in flight across all callers at once. */
  maxConcurrent: number;
  now?: () => number;
}

export const DEFAULTS: RateLimitOptions = {
  limit: 12,
  windowMs: 60_000,
  maxConcurrent: 4,
};

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * A fixed-window counter per caller plus a global in-flight cap.
 *
 * Deliberately a class with injected time rather than module state: it makes
 * the thing testable without waiting for real clocks, and makes the fact that
 * the state is per-instance visible at the call site.
 */
export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private inFlight = 0;
  private readonly options: Required<RateLimitOptions>;

  constructor(options: Partial<RateLimitOptions> = {}) {
    this.options = { ...DEFAULTS, now: () => Date.now(), ...options } as Required<RateLimitOptions>;
  }

  /** Take a slot for `key`, or refuse. Release with `release()` when done. */
  take(key: string): RateLimitResult {
    const now = this.options.now();

    if (this.inFlight >= this.options.maxConcurrent) {
      return { ok: false, retryAfter: 2, reason: "concurrency" };
    }

    const bucket = this.buckets.get(key);
    if (!bucket || now >= bucket.resetAt) {
      this.buckets.set(key, { count: 1, resetAt: now + this.options.windowMs });
      this.sweep(now);
      this.inFlight += 1;
      return { ok: true, retryAfter: 0 };
    }

    if (bucket.count >= this.options.limit) {
      return {
        ok: false,
        retryAfter: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
        reason: "rate",
      };
    }

    bucket.count += 1;
    this.inFlight += 1;
    return { ok: true, retryAfter: 0 };
  }

  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
  }

  /** Drop expired buckets so a long-lived instance does not grow unbounded. */
  private sweep(now: number): void {
    if (this.buckets.size < 1000) return;
    for (const [key, bucket] of this.buckets) {
      if (now >= bucket.resetAt) this.buckets.delete(key);
    }
  }
}

/**
 * Who is asking, as well as this can be known behind a proxy.
 *
 * The first hop of x-forwarded-for is the client as the edge saw it. Both
 * headers are caller-supplied and can be forged; this identifies a caller well
 * enough to slow a loop down, and is not an access control.
 */
export function callerKey(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return headers.get("x-real-ip")?.trim() || "unknown";
}
