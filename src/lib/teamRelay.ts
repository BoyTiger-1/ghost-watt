// Team scan without a database.
//
// Teams normally live in Upstash Redis (roomstore.ts). A deployment without it used
// to switch the feature off, because a session kept in one serverless instance's
// memory is invisible to the next instance - two students could join "the same"
// code and never see each other. That is the bug this file removes.
//
// With no Redis configured, a team runs over a public message relay (ntfy.sh)
// instead, straight from each browser:
//
//   - the topic name is a hash of the code, so the code itself never appears;
//   - every message is AES-GCM encrypted with a key derived from the code, so the
//     relay only ever sees ciphertext and anyone without the code sees noise;
//   - it carries the same computed device rows the server route carries, never a
//     photo, and every row is re-sanitized on the way in (sanitizeContribution);
//   - the board streams new messages over one Server-Sent Events connection rather
//     than polling, which keeps a whole class well inside the relay's limits.
//
// The relay keeps messages for about 12 hours, which covers a class period with
// room to spare. The board also keeps its own copy in localStorage, so whoever
// started the team still has the result the next day. Redis remains the better
// home for a real deployment, and the UI says which one a team is using.

import { sanitizeContribution, MAX_CONTRIBUTIONS, type ClassSession, type Contribution } from "./classroom";
import type { Offender } from "./types";

const RELAY = "https://ntfy.sh";
/** ntfy turns anything over 4096 bytes into an attachment; stay well clear. */
const CHUNK = 3600;
/** How long the relay holds messages, for the copy on screen. */
export const RELAY_HOURS = 12;

// ---- crypto -----------------------------------------------------------------

const enc = new TextEncoder();
const dec = new TextDecoder();

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

const hex = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");

export async function topicFor(code: string): Promise<string> {
  return "gw-" + hex(await sha256("ghostwatt-topic:" + code)).slice(0, 28);
}

const keys = new Map<string, Promise<CryptoKey>>();
function keyFor(code: string): Promise<CryptoKey> {
  let k = keys.get(code);
  if (!k) {
    k = sha256("ghostwatt-key:" + code).then((raw) =>
      crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]),
    );
    keys.set(code, k);
  }
  return k;
}

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const body = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(body).arrayBuffer());
}

async function seal(code: string, payload: unknown): Promise<string> {
  let bytes: Uint8Array = enc.encode(JSON.stringify(payload));
  // Compression first (ciphertext does not compress), when the browser has it.
  const z = typeof CompressionStream !== "undefined";
  if (z) bytes = await pipe(bytes, new CompressionStream("deflate-raw"));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFor(code), bytes as BufferSource));
  return (z ? "z" : "p") + toB64(iv) + "." + toB64(ct);
}

async function open(code: string, sealed: string): Promise<unknown> {
  const z = sealed[0] === "z";
  const [ivB, ctB] = sealed.slice(1).split(".");
  let bytes: Uint8Array = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(ivB) as BufferSource }, await keyFor(code), fromB64(ctB) as BufferSource),
  );
  if (z) bytes = await pipe(bytes, new DecompressionStream("deflate-raw"));
  return JSON.parse(dec.decode(bytes));
}

// ---- wire format ----------------------------------------------------------------
//
// One logical message is one or more relay messages:  gw1.<id>.<part>.<parts>.<chunk>
// Chunks are joined by id and opened once all parts are in.

interface Meta {
  t: "meta";
  buildingName: string;
  regionCode: string;
  createdAt: string;
}

interface Sent {
  t: "c";
  area: string;
  contributor: string;
  mode: Contribution["mode"];
  offenders: Partial<Offender>[];
}

type Payload = Meta | Sent;

async function publish(code: string, payload: Payload): Promise<void> {
  const sealed = await seal(code, payload);
  const id = toB64(crypto.getRandomValues(new Uint8Array(6))).replace(/[+/=]/g, "x");
  const parts = Math.max(1, Math.ceil(sealed.length / CHUNK));
  const topic = await topicFor(code);
  for (let i = 0; i < parts; i++) {
    const res = await fetch(`${RELAY}/${topic}`, {
      method: "POST",
      body: `gw1.${id}.${i}.${parts}.${sealed.slice(i * CHUNK, (i + 1) * CHUNK)}`,
    });
    if (!res.ok) throw new Error(res.status === 429 ? "busy" : `relay ${res.status}`);
  }
}

/** Only the fields the board needs, rounded, so a room fits in one or two messages. */
function compact(o: Offender): Partial<Offender> {
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    id: o.id,
    categoryId: o.categoryId,
    label: o.label,
    icon: o.icon,
    count: o.count,
    state: o.state,
    perUnitWatts: r(o.perUnitWatts),
    totalWatts: r(o.totalWatts),
    kwhPerYear: r(o.kwhPerYear),
    costPerYear: r(o.costPerYear),
    co2KgPerYear: r(o.co2KgPerYear),
    costLowPerYear: r(o.costLowPerYear),
    costHighPerYear: r(o.costHighPerYear),
    group: o.group,
    action: { ...o.action, note: "" },
    fixCost: r(o.fixCost),
    annualSavings: r(o.annualSavings),
    paybackMonths: o.paybackMonths,
    confidence: o.confidence,
  };
}

// ---- public API -------------------------------------------------------------------

export async function relayCreate(code: string, buildingName: string, regionCode: string): Promise<void> {
  const meta: Meta = { t: "meta", buildingName, regionCode, createdAt: new Date().toISOString() };
  await publish(code, meta);
  saveLocal(code, { meta, contributions: [] });
}

export async function relaySubmit(
  code: string,
  c: { area: string; contributor: string; mode: Contribution["mode"]; offenders: Offender[] },
): Promise<void> {
  await publish(code, { t: "c", area: c.area, contributor: c.contributor, mode: c.mode, offenders: c.offenders.map(compact) });
}

export interface RelayState {
  session: ClassSession | null;
  /** True once the relay's backlog has been read, so "no such team" can be told apart from "still loading". */
  loaded: boolean;
  /** Connection trouble, in words. */
  error: string | null;
}

/**
 * Follow a team. Calls back with the folded session every time something lands.
 * Returns an unsubscribe function.
 */
export function relaySubscribe(code: string, onState: (s: RelayState) => void): () => void {
  let closed = false;
  let es: EventSource | null = null;
  const seen = new Set<string>();
  const chunks = new Map<string, { parts: string[]; got: number; time: number }>();
  const local = loadLocal(code);
  let meta: Meta | null = local?.meta ?? null;
  // Keyed by area + contributor: sending a room again replaces it, as on the server.
  const byKey = new Map<string, Contribution>((local?.contributions ?? []).map((c) => [keyOf(c), c]));
  let loaded = false;
  let error: string | null = null;

  const emit = () => {
    if (closed) return;
    const contributions = [...byKey.values()].sort((a, b) => a.at.localeCompare(b.at)).slice(-MAX_CONTRIBUTIONS);
    const session: ClassSession | null = meta
      ? { code, buildingName: meta.buildingName, regionCode: meta.regionCode, createdAt: meta.createdAt, contributions }
      : contributions.length
        ? { code, buildingName: "Team " + code, regionCode: "US", createdAt: contributions[0].at, contributions }
        : null;
    if (session && meta) saveLocal(code, { meta, contributions });
    onState({ session, loaded, error });
  };

  const accept = async (payload: unknown, time: number) => {
    if (!payload || typeof payload !== "object") return;
    const p = payload as Payload;
    if (p.t === "meta") {
      if (!meta || p.createdAt < meta.createdAt) {
        meta = {
          t: "meta",
          buildingName: String(p.buildingName ?? "").slice(0, 60) || "Our building",
          regionCode: String(p.regionCode ?? "US").slice(0, 2).toUpperCase(),
          createdAt: String(p.createdAt ?? new Date(time * 1000).toISOString()),
        };
      }
    } else if (p.t === "c") {
      // The same gate the server route uses: clamps, caps, strips control characters.
      const c = sanitizeContribution(p, `${time}-${byKey.size}`);
      if (!c) return;
      c.at = new Date(time * 1000).toISOString();
      const prev = byKey.get(keyOf(c));
      if (!prev || prev.at <= c.at) byKey.set(keyOf(c), c);
    }
  };

  const onMessage = async (raw: string) => {
    let m: { id?: string; event?: string; time?: number; message?: string };
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    if (m.event !== "message" || !m.id || !m.message || seen.has(m.id)) return;
    seen.add(m.id);
    const head = /^gw1\.([A-Za-z0-9]+)\.(\d+)\.(\d+)\.([\s\S]*)$/.exec(m.message);
    if (!head) return;
    const [, id, partS, partsS, body] = head;
    const part = Number(partS);
    const parts = Number(partsS);
    if (!(parts >= 1 && parts <= 64 && part < parts)) return;
    const slot = chunks.get(id) ?? { parts: new Array<string>(parts).fill(""), got: 0, time: m.time ?? Date.now() / 1000 };
    if (!slot.parts[part]) {
      slot.parts[part] = body;
      slot.got++;
    }
    chunks.set(id, slot);
    if (slot.got < parts) return;
    chunks.delete(id);
    try {
      await accept(await open(code, slot.parts.join("")), slot.time);
      emit();
    } catch {
      // Not ours, tampered with, or truncated: ignored rather than shown.
    }
  };

  void topicFor(code).then((topic) => {
    if (closed) return;
    emit();
    // since=all replays the relay's backlog and then stays open for new messages.
    es = new EventSource(`${RELAY}/${topic}/sse?since=all`);
    es.onopen = () => {
      error = null;
      // The backlog arrives right after the connection opens; give it a moment
      // before treating an empty team as missing.
      setTimeout(() => {
        loaded = true;
        emit();
      }, 1500);
    };
    es.onmessage = (e) => void onMessage(e.data);
    es.onerror = () => {
      error = "Lost the connection to the team relay. Retrying…";
      loaded = true;
      emit();
    };
  });

  return () => {
    closed = true;
    es?.close();
  };
}

const keyOf = (c: { area: string; contributor: string }) => `${c.area.trim().toLowerCase()}|${c.contributor.trim().toLowerCase()}`;

// ---- the board's own copy ------------------------------------------------------------

interface Local {
  meta: Meta;
  contributions: Contribution[];
}

const LOCAL_PREFIX = "ghostwatt.team.";

function saveLocal(code: string, v: Local) {
  try {
    localStorage.setItem(LOCAL_PREFIX + code, JSON.stringify(v));
  } catch {
    // Private mode or full: the relay still has it for a while.
  }
}

function loadLocal(code: string): Local | null {
  try {
    const raw = localStorage.getItem(LOCAL_PREFIX + code);
    if (!raw) return null;
    const v = JSON.parse(raw) as Local;
    return v?.meta?.t === "meta" && Array.isArray(v.contributions) ? v : null;
  } catch {
    return null;
  }
}
