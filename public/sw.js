/*
 * Ghost Watt service worker.
 *
 * The point is not "offline-first as a feature". The point is that the place this
 * app is used - a boiler room, a basement corridor, the far end of a 1960s
 * building - is exactly where a phone has no bars. A scan there should not fail
 * because the shell could not be fetched.
 *
 * The rules are deliberately narrow, because a service worker that caches too
 * eagerly is worse than none at all:
 *
 *   - Navigations are network-first with a cache fallback. Fresh when there is a
 *     network, still opens when there is not.
 *   - Build assets (/_next/static/*) are hashed and immutable, so cache-first.
 *   - /api/* is NEVER cached and never intercepted. Prices, grid mix and class
 *     sessions are live data; serving a stale carbon intensity would quietly turn
 *     an honest number into a wrong one, which is the one failure this app cannot
 *     afford.
 *   - Only GET. A queued POST that fires later would submit a scan into a class
 *     session with no way to tell the user it happened.
 */

const VERSION = "gw-v1";
const SHELL = `${VERSION}-shell`;
const RUNTIME = `${VERSION}-runtime`;

// Enough to open the app and run a room-profile estimate with no network at all.
const PRECACHE = ["/", "/scan", "/portfolio", "/methodology", "/offline", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      // addAll fails the whole install if any single URL 404s, which would leave
      // the worker permanently stuck. Take what we can get.
      await Promise.allSettled(PRECACHE.map((url) => cache.add(url)));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
});

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.endsWith(".svg") ||
    url.pathname.endsWith(".woff2") ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // live data only, always

  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const hit = await caches.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) (await caches.open(RUNTIME)).put(req, res.clone());
        return res;
      })(),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const res = await fetch(req);
          if (res.ok) (await caches.open(RUNTIME)).put(req, res.clone());
          return res;
        } catch {
          return (
            (await caches.match(req)) ??
            (await caches.match("/offline")) ??
            (await caches.match("/")) ??
            new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } })
          );
        }
      })(),
    );
  }
});
