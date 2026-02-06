/* eslint-disable no-restricted-globals */
/**
 * Minimal, framework-agnostic service worker for scoped offline support.
 *
 * Goals:
 * - Precache app shell (built assets) so app can load offline after first visit.
 * - Runtime cache Wikipedia API responses for article + search, allowing offline access
 *   to previously viewed content.
 * - Keep last N (titles/queries) in localStorage (app code) and use SW to resync them
 *   when connection returns.
 *
 * Notes:
 * - This file lives in /public and is served as /service-worker.js.
 * - For CRA builds, precache list is injected via __WB_MANIFEST (Workbox) only if
 *   the build pipeline supports it. We implement a safe fallback for environments
 *   where it's not injected.
 */

const VERSION = "wiki-pwa-v1";
const SHELL_CACHE = `${VERSION}:shell`;
const RUNTIME_CACHE = `${VERSION}:runtime`;

// Keep runtime cache bounded (best-effort).
const RUNTIME_MAX_ENTRIES = 80;

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function isSameOrigin(url) {
  try {
    return new URL(url).origin === self.location.origin;
  } catch {
    return false;
  }
}

function isWikipediaApiRequest(url) {
  try {
    const u = new URL(url);
    // Cache REST v1 and Action API calls (used by this app).
    return (
      u.pathname.includes("/api/rest_v1/") ||
      u.pathname.endsWith("/w/api.php") ||
      u.pathname.includes("/w/api.php")
    );
  } catch {
    return false;
  }
}

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxEntries) return;

  // Delete oldest first.
  const toDelete = keys.length - maxEntries;
  for (let i = 0; i < toDelete; i += 1) {
    await cache.delete(keys[i]);
  }
}

async function precacheShell() {
  // Workbox-style manifest injection if available.
  const wbManifest = self.__WB_MANIFEST;

  const urls = Array.isArray(wbManifest)
    ? wbManifest.map((e) => e.url).filter(Boolean)
    : [
        // Fallback: cache the entrypoints we can reasonably guess.
        "/",
        "/index.html",
        "/manifest.json",
        "/favicon.ico",
      ];

  const cache = await caches.open(SHELL_CACHE);
  await cache.addAll(urls);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await precacheShell();
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.map((n) => {
          if (n.startsWith("wiki-pwa-") && n !== SHELL_CACHE && n !== RUNTIME_CACHE) {
            return caches.delete(n);
          }
          return null;
        })
      );
      await self.clients.claim();
    })()
  );
});

self.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== "object") return;

  if (msg.type === "WIKI_RESYNC") {
    event.waitUntil(resyncRecents());
  }
});

async function resyncRecents() {
  // We cannot directly read window localStorage from SW.
  // Resync is implemented as "warm" runtime cache refresh for likely URLs,
  // derived from currently open client URLs.
  const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });

  // Best-effort: refetch any currently open wiki API calls is not possible here.
  // Instead: fetch the app shell root to ensure latest, and keep runtime cache trim.
  try {
    await fetch("/", { cache: "no-store" });
  } catch {
    // ignore if still offline
  }

  await trimCache(RUNTIME_CACHE, RUNTIME_MAX_ENTRIES);

  // Also tell clients that resync ran (optional hook for UI).
  for (const c of clients) {
    try {
      c.postMessage({ type: "WIKI_RESYNC_DONE" });
    } catch {
      // ignore
    }
  }
}

async function handleNavigation(request) {
  // App shell style: network-first for HTML so users get updates, fallback to cache.
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(SHELL_CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Fallback to cached root document.
    const root = await caches.match("/");
    if (root) return root;

    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function handleWikipediaApi(request) {
  // Stale-while-revalidate:
  // - Serve cache if present.
  // - Always try to update runtime cache in background (if online).
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);

  const fetchPromise = (async () => {
    try {
      const fresh = await fetch(request);
      if (fresh && fresh.ok) {
        cache.put(request, fresh.clone());
        await trimCache(RUNTIME_CACHE, RUNTIME_MAX_ENTRIES);
      }
      return fresh;
    } catch {
      return null;
    }
  })();

  if (cached) {
    // Update in background.
    fetchPromise.catch(() => null);
    return cached;
  }

  const fresh = await fetchPromise;
  if (fresh) return fresh;

  return new Response(
    JSON.stringify({ error: "offline", message: "No cached response available." }),
    { status: 503, headers: { "Content-Type": "application/json" } }
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!request) return;

  const url = request.url;

  // Only handle GET.
  if (request.method !== "GET") return;

  // Handle app navigation (React Router).
  if (isNavigationRequest(request) && isSameOrigin(url)) {
    event.respondWith(handleNavigation(request));
    return;
  }

  // Runtime cache: Wikipedia API responses (cross-origin).
  if (isWikipediaApiRequest(url)) {
    event.respondWith(handleWikipediaApi(request));
    return;
  }

  // Same-origin static assets: cache-first (best-effort).
  if (isSameOrigin(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;

        try {
          const res = await fetch(request);
          // Cache only successful, basic responses.
          if (res && res.ok && res.type === "basic") {
            const cache = await caches.open(SHELL_CACHE);
            cache.put(request, res.clone());
          }
          return res;
        } catch {
          return cached || new Response("Offline", { status: 503 });
        }
      })()
    );
  }
});
