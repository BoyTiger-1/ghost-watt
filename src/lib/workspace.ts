// The scan in progress, kept on this device.
//
// Photos and video frames are far too big for localStorage (a few MB in all),
// so the work in progress lives in IndexedDB: the captures with their pictures,
// their readings and the user's corrections, plus which one was open. Videos
// are kept as blobs so the clip still plays after a reload. Nothing here ever
// leaves the browser.

import type { Capture } from "./capture";

const DB = "ghostwatt-work";
const STORE = "work";
const KEY = "current";

export interface Workspace {
  captures: (Capture & { videoBlob?: Blob })[];
  selectedId: string | null;
  /** Captures added to a place, and as which room. */
  added?: Record<string, { buildingId: string; room: string }>;
  savedAt: string;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Video blobs already read, so each save does not re-read every clip. */
const blobs = new Map<string, Blob>();

export async function saveWorkspace(
  captures: Capture[],
  selectedId: string | null,
  added: Record<string, { buildingId: string; room: string }>,
): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const out: Workspace["captures"] = [];
  for (const c of captures) {
    let videoBlob = blobs.get(c.id);
    if (!videoBlob && c.videoUrl) {
      try {
        videoBlob = await (await fetch(c.videoUrl)).blob();
        blobs.set(c.id, videoBlob);
      } catch {
        // The clip is gone; its frames are still kept.
      }
    }
    // An object URL means nothing after a reload; the blob is what is kept.
    const rest = { ...c, videoUrl: undefined };
    out.push(videoBlob ? { ...rest, videoBlob } : rest);
  }
  const ws: Workspace = { captures: out, selectedId, added, savedAt: new Date().toISOString() };
  try {
    await run("readwrite", (s) => s.put(ws, KEY));
  } catch {
    // Storage full or blocked: the work stays on screen for this visit.
  }
}

/** The saved work, ready to show: half-finished readings are queued again, clips get fresh URLs. */
export async function loadWorkspace(): Promise<{
  captures: Capture[];
  selectedId: string | null;
  added: Record<string, { buildingId: string; room: string }>;
} | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const ws = await run<Workspace | undefined>("readonly", (s) => s.get(KEY));
    if (!ws?.captures?.length) return null;
    const captures = ws.captures.map(({ videoBlob, ...c }) => {
      const restored: Capture = { ...c };
      if (videoBlob) {
        restored.videoUrl = URL.createObjectURL(videoBlob);
        blobs.set(c.id, videoBlob);
      }
      if (c.status === "working") restored.status = "pending";
      restored.stage = undefined;
      restored.progress = undefined;
      return restored;
    });
    return { captures, selectedId: ws.selectedId, added: ws.added ?? {} };
  } catch {
    return null;
  }
}

export async function clearWorkspace(): Promise<void> {
  blobs.clear();
  if (typeof indexedDB === "undefined") return;
  try {
    await run("readwrite", (s) => s.delete(KEY));
  } catch {
    // Nothing to clear.
  }
}

/** Everything Ghost Watt keeps in this browser: saved places, notes, settings and the work in progress. */
export async function eraseEverything(): Promise<void> {
  try {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("gw-") || k.startsWith("ghostwatt.")) localStorage.removeItem(k);
    }
  } catch {
    // Storage blocked: nothing was kept there.
  }
  blobs.clear();
  if (typeof indexedDB === "undefined") return;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB);
    req.onsuccess = req.onerror = req.onblocked = () => resolve();
  });
}
