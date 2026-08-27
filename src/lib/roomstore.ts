// Where a class session actually lives.
//
// This is the first and only piece of Ghost Watt that keeps state on a server, and
// it is deliberately the smallest thing that could work. There is no database
// schema, no ORM, no accounts table, no migration story - a session is one JSON blob
// under one key with an expiry on it, because that is genuinely all a classroom
// exercise needs and every additional moving part would be one more thing to defend.
//
// Two backends, same three operations, chosen the same way as every other provider
// in this app - live if configured, degrade quietly if not:
//
//   1. Upstash Redis over REST. Free tier, serverless-native, TTL built in. This is
//      what makes class mode work on a real deployment where each request may land
//      on a different machine. Also picked up automatically from Vercel KV's
//      variable names, since Vercel KV is Upstash underneath.
//
//   2. Process memory. No key, no signup, works instantly on localhost. Correct for
//      development and for a single-machine demo, and WRONG for a real deployment -
//      serverless instances do not share memory, so two students could land on two
//      instances and never see each other. The app says so rather than pretending.
//
// The memory tier existing at all is what lets the feature be developed, demoed and
// judged with no key. The Redis tier is what lets it be used.

import type { ClassSession } from "./classroom";
import { SESSION_TTL_DAYS } from "./classroom";

const TTL_SECONDS = SESSION_TTL_DAYS * 24 * 3600;
const PREFIX = "ghostwatt:class:";
const TIMEOUT_MS = 8000;

export type StoreTier = "redis" | "memory";

interface RedisConfig {
  url: string;
  token: string;
}

/**
 * Accept either Upstash's own variable names or Vercel KV's, because a project
 * deployed on Vercel gets the KV_ ones injected automatically and asking someone
 * to duplicate them under different names is a pointless step to get wrong.
 */
function redisConfig(): RedisConfig | null {
  const url =
    process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim();
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim();
  return url && token ? { url, token } : null;
}

export function storeTier(): StoreTier {
  return redisConfig() ? "redis" : "memory";
}

/**
 * True when sessions will survive across serverless instances.
 * The UI uses this to warn honestly rather than to hide the feature.
 */
export function isDurable(): boolean {
  return storeTier() === "redis";
}

// ---- memory tier --------------------------------------------------------
//
// Hung off globalThis so Next's dev-mode module reloading does not wipe sessions
// between requests, which would make the feature look broken while developing it.

interface MemoryEntry {
  session: ClassSession;
  expiresAt: number;
}

const memory: Map<string, MemoryEntry> = (() => {
  const g = globalThis as { __ghostwattClassStore?: Map<string, MemoryEntry> };
  if (!g.__ghostwattClassStore) g.__ghostwattClassStore = new Map();
  return g.__ghostwattClassStore;
})();

function memorySweep() {
  const now = Date.now();
  for (const [k, v] of memory) if (v.expiresAt <= now) memory.delete(k);
}

// ---- redis tier ---------------------------------------------------------

async function redisCommand(cfg: RedisConfig, command: unknown[]): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(cfg.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(command),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Redis HTTP ${res.status}`);
    const json = (await res.json()) as { result?: unknown; error?: string };
    if (json.error) throw new Error(json.error);
    return json.result;
  } finally {
    clearTimeout(timer);
  }
}

// ---- public API ---------------------------------------------------------

export async function readSession(code: string): Promise<ClassSession | null> {
  const cfg = redisConfig();

  if (cfg) {
    try {
      const raw = await redisCommand(cfg, ["GET", PREFIX + code]);
      if (typeof raw !== "string") return null;
      return JSON.parse(raw) as ClassSession;
    } catch {
      // Fall through to memory rather than erroring: a transient Redis blip
      // should degrade the feature, not break the page.
      return null;
    }
  }

  memorySweep();
  return memory.get(code)?.session ?? null;
}

export async function writeSession(session: ClassSession): Promise<boolean> {
  const cfg = redisConfig();

  if (cfg) {
    try {
      await redisCommand(cfg, [
        "SET",
        PREFIX + session.code,
        JSON.stringify(session),
        "EX",
        String(TTL_SECONDS),
      ]);
      return true;
    } catch {
      return false;
    }
  }

  memorySweep();
  memory.set(session.code, {
    session,
    expiresAt: Date.now() + TTL_SECONDS * 1000,
  });
  return true;
}

/**
 * Read, mutate, write.
 *
 * Deliberately not atomic. Two students submitting in the same instant could in
 * principle have one submission overwrite the other, and the honest reason that is
 * acceptable here is arithmetic: a class of thirty submitting over ten minutes makes
 * a collision vanishingly unlikely, and the cost of one is a student re-submitting a
 * scan they still have on their phone. Buying true atomicity would mean Lua scripts
 * or a real transaction, which is a large amount of machinery to protect against a
 * lost room count in a classroom exercise.
 */
export async function updateSession(
  code: string,
  mutate: (s: ClassSession) => ClassSession,
): Promise<ClassSession | null> {
  const current = await readSession(code);
  if (!current) return null;
  const next = mutate(current);
  const ok = await writeSession(next);
  return ok ? next : null;
}
