/**
 * The caller limit. Injected clock so the window can be crossed without
 * waiting for one.
 */
import { describe, expect, it } from "vitest";
import { RateLimiter, callerKey } from "../rate-limit";

describe("RateLimiter", () => {
  it("allows up to the limit and refuses the next", () => {
    const now = 0;
    const limiter = new RateLimiter({ limit: 3, windowMs: 1000, maxConcurrent: 99, now: () => now });

    for (let i = 0; i < 3; i += 1) {
      expect(limiter.take("a").ok).toBe(true);
      limiter.release();
    }
    const refused = limiter.take("a");
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe("rate");
    expect(refused.retryAfter).toBeGreaterThan(0);
  });

  it("starts a fresh window once the old one has passed", () => {
    let now = 0;
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000, maxConcurrent: 99, now: () => now });

    expect(limiter.take("a").ok).toBe(true);
    limiter.release();
    expect(limiter.take("a").ok).toBe(false);

    now = 1001;
    expect(limiter.take("a").ok).toBe(true);
  });

  it("counts each caller separately", () => {
    const now = 0;
    const limiter = new RateLimiter({ limit: 1, windowMs: 1000, maxConcurrent: 99, now: () => now });

    expect(limiter.take("a").ok).toBe(true);
    limiter.release();
    expect(limiter.take("b").ok).toBe(true);
    limiter.release();
    expect(limiter.take("a").ok).toBe(false);
  });

  it("refuses when too many requests are already in flight", () => {
    const limiter = new RateLimiter({ limit: 99, windowMs: 1000, maxConcurrent: 2 });

    expect(limiter.take("a").ok).toBe(true);
    expect(limiter.take("b").ok).toBe(true);
    const refused = limiter.take("c");
    expect(refused.ok).toBe(false);
    expect(refused.reason).toBe("concurrency");

    limiter.release();
    expect(limiter.take("c").ok).toBe(true);
  });

  it("does not let release drive the count below zero", () => {
    const limiter = new RateLimiter({ limit: 99, windowMs: 1000, maxConcurrent: 1 });
    limiter.release();
    limiter.release();
    expect(limiter.take("a").ok).toBe(true);
  });
});

describe("callerKey", () => {
  it("takes the first hop of x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" });
    expect(callerKey(headers)).toBe("203.0.113.5");
  });

  it("falls back to x-real-ip, then to a shared bucket", () => {
    expect(callerKey(new Headers({ "x-real-ip": "198.51.100.7" }))).toBe("198.51.100.7");
    expect(callerKey(new Headers())).toBe("unknown");
  });
});
