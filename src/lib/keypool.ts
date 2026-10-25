// Several API keys for one provider, used in turn.
//
// A provider's key variable can hold a comma-separated list, and KEY_2 through
// KEY_9 add more. Requests rotate through them, and a key the provider just
// rate-limited sits out for as long as the provider asked, so the request moves
// straight to the next key instead of waiting. A key that is refused outright
// (revoked, mistyped) sits out for ten minutes rather than failing every scan.
//
// The rest periods live in this server instance's memory: on serverless hosting
// each warm instance keeps its own, which is fine for spreading load.

const BAD_KEY_REST_MS = 10 * 60 * 1000;

/** Every key configured for `envName`, in order, without duplicates. */
export function keysFromEnv(envName: string, env: Record<string, string | undefined> = process.env): string[] {
  const raw = [env[envName], ...Array.from({ length: 8 }, (_, i) => env[`${envName}_${i + 2}`])];
  const keys = raw
    .filter((v): v is string => typeof v === "string")
    .flatMap((v) => v.split(/[\s,]+/))
    .map((k) => k.trim())
    .filter(Boolean);
  return [...new Set(keys)];
}

export class KeyPool {
  private turn = 0;
  private readonly restUntil = new Map<string, number>();

  constructor(private readonly keys: string[]) {}

  get size(): number {
    return this.keys.length;
  }

  /**
   * The next key to use: the next in rotation that is not resting, other than
   * `not`. If every key is resting, the one that wakes first (so a caller can
   * still wait and retry), or null when there is nothing else to offer.
   */
  next(now = Date.now(), not?: string): string | null {
    const n = this.keys.length;
    if (!n) return null;
    for (let i = 0; i < n; i++) {
      const k = this.keys[(this.turn + i) % n];
      if (k === not) continue;
      if ((this.restUntil.get(k) ?? 0) <= now) {
        this.turn = (this.turn + i + 1) % n;
        return k;
      }
    }
    const waking = this.keys.filter((k) => k !== not).sort((a, b) => (this.restUntil.get(a) ?? 0) - (this.restUntil.get(b) ?? 0));
    return waking[0] ?? null;
  }

  /** Whether any key other than `not` is free right now. */
  hasFree(now = Date.now(), not?: string): boolean {
    return this.keys.some((k) => k !== not && (this.restUntil.get(k) ?? 0) <= now);
  }

  /** The provider rate-limited this key: rest it for `ms`. */
  rest(key: string, ms: number, now = Date.now()): void {
    this.restUntil.set(key, Math.max(this.restUntil.get(key) ?? 0, now + ms));
  }

  /** The provider refused this key outright. */
  refuse(key: string, now = Date.now()): void {
    this.rest(key, BAD_KEY_REST_MS, now);
  }
}

const pools = new Map<string, KeyPool>();

/** One pool per provider variable, rebuilt if the configured keys change. */
export function poolFor(envName: string, env: Record<string, string | undefined> = process.env): KeyPool {
  const keys = keysFromEnv(envName, env);
  const id = `${envName}:${keys.join(",")}`;
  let pool = pools.get(id);
  if (!pool) {
    pool = new KeyPool(keys);
    pools.set(id, pool);
  }
  return pool;
}
