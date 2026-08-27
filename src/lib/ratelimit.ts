// Standing between a public URL and someone else's API bill.
//
// On localhost /api/analyze is harmless. On a public deployment it is an open proxy
// to a metered vision provider: anyone who opens devtools, sees the endpoint and
// writes a four-line loop is spending the deployer's money until the account is
// empty. Nothing else in this app has that property, so this is the one place that
// needs a guard.
//
// The hard constraint shaping the numbers below is that A CLASSROOM IS ONE IP.
// Thirty students on school wifi leave the building through a single NAT address, so
// a per-IP limit tuned like a normal API - ten a minute, say - would block precisely
// the situation class mode was built for, and it would look like a bug rather than a
// policy. The per-IP window is therefore sized for a real class period, and the
// thing actually protecting the wallet is the global daily ceiling underneath it:
// per-IP stops one script hammering, global caps total spend no matter how many
// addresses it arrives from.
//
// Same two tiers as roomstore, chosen the same way: Redis when configured so the
// count is shared across serverless instances, process memory otherwise. The memory
// tier is honest but weak - each instance counts separately - which is fine for a
// laptop and is why isDurableLimit() exists for the status page to admit it.

const TIMEOUT_MS = 5000;
const PREFIX = "ghostwatt:rl:";

export interface RateVerdict {
  ok: boolean;
  /** Which ceiling was hit; useful for saying something true in the 429 body. */
  scope: "ip" | "global" | null;
  remaining: number;
  /** Seconds until the window that rejected this request rolls over. */
  resetSeconds: number;
}

export interface RateRule {
  /** Requests permitted per window. */
  limit: number;
  windowSeconds: number;
}

/**
 * Budgets, with the reasoning attached so they can be argued with later.
 *
 * analyzeIp: a class of thirty doing four photos each inside ten minutes is 120
 * requests off one school address. That is the real ceiling this has to clear, and
 * anything tighter breaks the demo in front of a judge.
 *
 * analyzeGlobal: the spend cap. A free Groq tier does not survive an afternoon of
 * automated abuse, and this is the number that stops it. Set deliberately higher
 * than any plausible single class and far below "drained account".
 */
export const RULES = {
  analyzeIp: { limit: 120, windowSeconds: 600 },
  analyzeGlobal: { limit: 1500, windowSeconds: 86400 },
  classWriteIp: { limit: 90, windowSeconds: 600 },
  classCreateIp: { limit: 20, windowSeconds: 3600 },
} as const satisfies Record<string, RateRule>;

/**
 * Base64 of a 768px q0.72 JPEG runs ~100KB. Two megabytes is a generous ceiling for
 * anything the client actually produces, and refuses blob-stuffing.
 */
export const MAX_IMAGE_CHARS = 2_000_000;

interface RedisConfig {
  url: string;
  token: string;
}

function redisConfig(): RedisConfig | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim();
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

/** False when counters are per-instance and therefore only advisory. */
export function isDurableLimit(): boolean {
  return redisConfig() !== null;
}

/**
 * The caller's address, as seen from behind Vercel's proxy.
 *
 * x-forwarded-for is spoofable in general, which matters: anyone can send a header
 * claiming to be a fresh address and mint themselves a new per-IP budget. On Vercel
 * the platform overwrites the leftmost entry with the real peer, so taking [0] here
 * is sound - but the global ceiling is what makes the spoofable case survivable,
 * which is the other reason it exists.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

// ---- memory tier --------------------------------------------------------

interface Bucket {
  count: number;
  expiresAt: number;
}

const memory: Map<string, Bucket> = (() => {
  const g = globalThis as { __ghostwattRateLimit?: Map<string, Bucket> };
  if (!g.__ghostwattRateLimit) g.__ghostwattRateLimit = new Map();
  return g.__ghostwattRateLimit;
})();

function memoryHit(key: string, rule: RateRule): { count: number; resetSeconds: number } {
  const now = Date.now();
  // Opportunistic sweep; the map is small and this avoids a timer in a serverless
  // function that may be frozen between invocations anyway.
  if (memory.size > 5000) for (const [k, v] of memory) if (v.expiresAt <= now) memory.delete(k);

  const existing = memory.get(key);
  if (!existing || existing.expiresAt <= now) {
    memory.set(key, { count: 1, expiresAt: now + rule.windowSeconds * 1000 });
    return { count: 1, resetSeconds: rule.windowSeconds };
  }
  existing.count += 1;
  return {
    count: existing.count,
    resetSeconds: Math.max(1, Math.ceil((existing.expiresAt - now) / 1000)),
  };
}

// ---- redis tier ---------------------------------------------------------

async function redisCommand(cfg: RedisConfig, command: unknown[]): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + cfg.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Redis HTTP " + res.status);
    const json = (await res.json()) as { result?: unknown; error?: string };
    if (json.error) throw new Error(json.error);
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fixed window rather than a sliding log.
 *
 * A fixed window lets up to 2x the limit through across a window boundary, which for
 * a spend ceiling is an acceptable overshoot and buys a counter that is one INCR
 * instead of a sorted set with trimming. The cost of the imprecision is bounded and
 * the cost of the machinery would not be.
 */
async function redisHit(
  cfg: RedisConfig,
  key: string,
  rule: RateRule,
): Promise<{ count: number; resetSeconds: number }> {
  const window = Math.floor(Date.now() / (rule.windowSeconds * 1000));
  const k = PREFIX + key + ":" + window;
  const count = Number(await redisCommand(cfg, ["INCR", k]));
  // Only the request that created the key sets the expiry, so the window cannot be
  // extended indefinitely by continued traffic.
  if (count === 1) await redisCommand(cfg, ["EXPIRE", k, String(rule.windowSeconds)]);
  const elapsed = Date.now() / 1000 - window * rule.windowSeconds;
  return { count, resetSeconds: Math.max(1, Math.ceil(rule.windowSeconds - elapsed)) };
}

// ---- public API ---------------------------------------------------------

async function hit(key: string, rule: RateRule): Promise<{ count: number; resetSeconds: number }> {
  const cfg = redisConfig();
  if (cfg) {
    try {
      return await redisHit(cfg, key, rule);
    } catch {
      // A Redis blip must not become a 500 on a scan. Fall back to the local
      // counter, which is weaker but still refuses a runaway loop on this instance.
      return memoryHit(key, rule);
    }
  }
  return memoryHit(key, rule);
}

/**
 * Check every ceiling that applies.
 *
 * Both counters are incremented even when the first one already failed, which is
 * deliberate: a caller who is hammering should not get their global budget refunded
 * because their per-IP budget rejected them first.
 */
export async function checkLimits(
  checks: Array<{ key: string; rule: RateRule; scope: "ip" | "global" }>,
): Promise<RateVerdict> {
  const results = await Promise.all(
    checks.map(async (c) => ({ ...c, ...(await hit(c.key, c.rule)) })),
  );
  const failed = results.find((r) => r.count > r.rule.limit);
  if (failed) {
    return { ok: false, scope: failed.scope, remaining: 0, resetSeconds: failed.resetSeconds };
  }
  const tightest = results.reduce((a, b) =>
    a.rule.limit - a.count <= b.rule.limit - b.count ? a : b,
  );
  return {
    ok: true,
    scope: null,
    remaining: Math.max(0, tightest.rule.limit - tightest.count),
    resetSeconds: tightest.resetSeconds,
  };
}

/** Standard headers so a client can back off intelligently instead of retrying blind. */
export function rateHeaders(v: RateVerdict, limit: number): Record<string, string> {
  return {
    "RateLimit-Limit": String(limit),
    "RateLimit-Remaining": String(v.remaining),
    "RateLimit-Reset": String(v.resetSeconds),
    ...(v.ok ? {} : { "Retry-After": String(v.resetSeconds) }),
  };
}
