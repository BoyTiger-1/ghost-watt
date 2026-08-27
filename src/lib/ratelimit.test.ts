// The rate limiter is the only thing standing between a public /api/analyze and a
// drained provider account, so its failure mode matters more than most code here:
// too strict and a classroom of thirty behind one NAT address gets locked out
// mid-demo, too loose and the ceiling is decorative. Both directions are tested.
//
// No Redis is configured under vitest, so these exercise the memory tier. That is
// the weaker of the two backends and the one whose arithmetic is worth pinning.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_IMAGE_CHARS,
  RULES,
  checkLimits,
  clientIp,
  isDurableLimit,
  rateHeaders,
} from "./ratelimit";

// Counters live in a module-level map, so every test needs its own key space or the
// previous test's traffic leaks into this one.
let n = 0;
const freshKey = () => `test-${Date.now()}-${n++}`;

const rule = { limit: 3, windowSeconds: 60 };

afterEach(() => {
  vi.useRealTimers();
});

describe("checkLimits", () => {
  it("allows exactly the limit and refuses the one after", async () => {
    const key = freshKey();
    const hit = () => checkLimits([{ key, rule, scope: "ip" as const }]);

    expect((await hit()).ok).toBe(true);
    expect((await hit()).ok).toBe(true);
    const third = await hit();
    expect(third.ok).toBe(true);
    expect(third.remaining).toBe(0);

    const fourth = await hit();
    expect(fourth.ok).toBe(false);
    expect(fourth.scope).toBe("ip");
  });

  it("counts each key separately, so one network cannot exhaust another", async () => {
    const a = freshKey();
    const b = freshKey();
    for (let i = 0; i < 4; i++) await checkLimits([{ key: a, rule, scope: "ip" }]);

    expect((await checkLimits([{ key: a, rule, scope: "ip" }])).ok).toBe(false);
    expect((await checkLimits([{ key: b, rule, scope: "ip" }])).ok).toBe(true);
  });

  it("reports which ceiling refused the request", async () => {
    // The global ceiling has to be able to trip while the per-IP budget is untouched;
    // that is the case where one address is fine but the deployment is out of budget.
    const ip = freshKey();
    const global = freshKey();
    const both = () =>
      checkLimits([
        { key: ip, rule: { limit: 100, windowSeconds: 60 }, scope: "ip" as const },
        { key: global, rule: { limit: 2, windowSeconds: 60 }, scope: "global" as const },
      ]);

    await both();
    await both();
    const blocked = await both();
    expect(blocked.ok).toBe(false);
    expect(blocked.scope).toBe("global");
  });

  it("charges every counter even when an earlier one already refused", async () => {
    // Otherwise a caller stuck behind their per-IP limit would consume no global
    // budget, and hammering would become free.
    const ip = freshKey();
    const global = freshKey();
    const checks = [
      { key: ip, rule: { limit: 1, windowSeconds: 60 }, scope: "ip" as const },
      { key: global, rule: { limit: 50, windowSeconds: 60 }, scope: "global" as const },
    ];

    for (let i = 0; i < 5; i++) await checkLimits(checks);

    // The global counter should now read 5, not 1. Drain the rest and check it
    // refuses earlier than a fresh counter would.
    const globalOnly = { key: global, rule: { limit: 50, windowSeconds: 60 }, scope: "global" as const };
    let allowed = 0;
    for (let i = 0; i < 100; i++) {
      if ((await checkLimits([globalOnly])).ok) allowed++;
      else break;
    }
    expect(allowed).toBe(45);
  });

  it("reports remaining against the tightest applicable ceiling", async () => {
    const v = await checkLimits([
      { key: freshKey(), rule: { limit: 100, windowSeconds: 60 }, scope: "ip" },
      { key: freshKey(), rule: { limit: 5, windowSeconds: 60 }, scope: "global" },
    ]);
    expect(v.ok).toBe(true);
    expect(v.remaining).toBe(4);
  });

  it("lets traffic through again once the window rolls over", async () => {
    vi.useFakeTimers();
    const key = freshKey();
    const hit = () => checkLimits([{ key, rule, scope: "ip" as const }]);

    for (let i = 0; i < 3; i++) await hit();
    expect((await hit()).ok).toBe(false);

    vi.advanceTimersByTime(61_000);
    expect((await hit()).ok).toBe(true);
  });
});

describe("budgets", () => {
  it("gives a classroom behind one address room to actually work", async () => {
    // Thirty students, four photos each, one NAT address, one class period. If this
    // ever fails, class mode breaks in exactly the demo it exists for.
    expect(RULES.analyzeIp.limit).toBeGreaterThanOrEqual(120);
    expect(RULES.analyzeIp.windowSeconds).toBeLessThanOrEqual(600);
  });

  it("keeps the global spend ceiling above one class and below a drained account", async () => {
    expect(RULES.analyzeGlobal.limit).toBeGreaterThan(RULES.analyzeIp.limit);
    expect(RULES.analyzeGlobal.limit).toBeLessThanOrEqual(5000);
    expect(RULES.analyzeGlobal.windowSeconds).toBe(86400);
  });

  it("caps uploads well above a real photo and well below a blob", () => {
    // A 768px q0.72 JPEG base64s to roughly 100-160KB.
    expect(MAX_IMAGE_CHARS).toBeGreaterThan(500_000);
    expect(MAX_IMAGE_CHARS).toBeLessThanOrEqual(4_000_000);
  });
});

describe("clientIp", () => {
  const withHeaders = (h: Record<string, string>) =>
    new Request("https://example.test/api/analyze", { headers: h });

  it("takes the leftmost forwarded address", () => {
    expect(clientIp(withHeaders({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" }))).toBe(
      "203.0.113.7",
    );
  });

  it("trims whitespace around a single address", () => {
    expect(clientIp(withHeaders({ "x-forwarded-for": "  203.0.113.7  " }))).toBe("203.0.113.7");
  });

  it("falls back to x-real-ip, then to a constant", () => {
    expect(clientIp(withHeaders({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
    expect(clientIp(withHeaders({}))).toBe("unknown");
  });

  it("never returns an empty string, which would merge every caller into one bucket", () => {
    expect(clientIp(withHeaders({ "x-forwarded-for": "" }))).toBe("unknown");
    expect(clientIp(withHeaders({ "x-forwarded-for": "   " }))).toBe("unknown");
  });
});

describe("rateHeaders", () => {
  it("sends Retry-After only when the request was actually refused", () => {
    const refused = rateHeaders(
      { ok: false, scope: "ip", remaining: 0, resetSeconds: 42 },
      120,
    );
    expect(refused["Retry-After"]).toBe("42");
    expect(refused["RateLimit-Limit"]).toBe("120");

    const allowed = rateHeaders({ ok: true, scope: null, remaining: 9, resetSeconds: 42 }, 120);
    expect(allowed["Retry-After"]).toBeUndefined();
    expect(allowed["RateLimit-Remaining"]).toBe("9");
  });
});

describe("isDurableLimit", () => {
  it("admits that counters are per-instance when no shared store is configured", () => {
    // Vitest runs with no Redis env, and the honest answer is false. A deployment
    // that reports false here is telling the truth about a weaker guarantee.
    expect(isDurableLimit()).toBe(false);
  });
});
