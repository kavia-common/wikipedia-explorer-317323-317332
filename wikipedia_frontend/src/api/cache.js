/**
 * In-memory caching utilities for the Wikipedia API layer.
 *
 * Phase 3 goals:
 * - LRU cache (bounded size) with TTL (time-to-live)
 * - optional localStorage persistence for "hot" keys (search/summaries)
 * - request de-duplication (concurrent callers share one in-flight promise)
 * - stale-while-revalidate (SWR): serve stale cache immediately, refresh in background
 *
 * IMPORTANT:
 * - This cache is intentionally simple and in-memory; it resets on page reload.
 * - localStorage persistence is best-effort and safe to fail (privacy/quota).
 * - AbortSignals are respected per-consumer via subscription wrappers: aborting one
 *   consumer does not cancel the shared network request for other consumers.
 */

const LS_PREFIX = "wiki_cache_v1:";

// Defaults tuned for this app.
const DEFAULT_MAX_ENTRIES = 100;

// Cache windows (ms). These can be tuned later.
export const TTL = {
  search: 60_000, // 1 min
  suggestions: 60_000, // 1 min
  summary: 10 * 60_000, // 10 min
  html: 10 * 60_000, // 10 min
  related: 10 * 60_000, // 10 min
  categories: 30 * 60_000, // 30 min
  categoryMembers: 2 * 60_000, // 2 min
};

/**
 * @typedef {Object} CacheEntry
 * @property {any} value
 * @property {number} expiresAt
 * @property {number} updatedAt
 */

/**
 * Basic LRU cache with TTL. Uses Map insertion order to track recency.
 */
class LruTtlCache {
  constructor({ maxEntries = DEFAULT_MAX_ENTRIES } = {}) {
    this.maxEntries = maxEntries;
    /** @type {Map<string, CacheEntry>} */
    this.map = new Map();
  }

  _now() {
    return Date.now();
  }

  _pruneIfNeeded() {
    while (this.map.size > this.maxEntries) {
      // first key in Map = least recently used
      const firstKey = this.map.keys().next().value;
      this.map.delete(firstKey);
    }
  }

  _touch(key, entry) {
    // Reinsert to end to mark as most recently used
    this.map.delete(key);
    this.map.set(key, entry);
  }

  /**
   * Return cache status for a key.
   * @param {string} key
   * @returns {{hit: boolean, stale: boolean, value?: any, expiresAt?: number, updatedAt?: number}}
   */
  getStatus(key) {
    const entry = this.map.get(key);
    if (!entry) return { hit: false, stale: false };
    this._touch(key, entry);

    const now = this._now();
    const stale = now > entry.expiresAt;
    return {
      hit: true,
      stale,
      value: entry.value,
      expiresAt: entry.expiresAt,
      updatedAt: entry.updatedAt,
    };
  }

  /**
   * Get a value (undefined if missing or expired).
   * @param {string} key
   * @returns {any|undefined}
   */
  getFresh(key) {
    const st = this.getStatus(key);
    if (!st.hit) return undefined;
    if (st.stale) return undefined;
    return st.value;
  }

  /**
   * Set a value with TTL.
   * @param {string} key
   * @param {any} value
   * @param {number} ttlMs
   */
  set(key, value, ttlMs) {
    const now = this._now();
    const entry = {
      value,
      expiresAt: now + Math.max(0, ttlMs || 0),
      updatedAt: now,
    };
    this.map.set(key, entry);
    this._touch(key, entry);
    this._pruneIfNeeded();
    return entry;
  }

  /**
   * Delete a specific key.
   * @param {string} key
   */
  delete(key) {
    this.map.delete(key);
  }

  /**
   * Clear all cache entries.
   */
  clear() {
    this.map.clear();
  }
}

/**
 * In-flight request registry for de-duplication.
 * Key => shared promise.
 *
 * Note: We intentionally do not store AbortController here; individual consumers
 * attach their own AbortSignal gating, so aborting one consumer does not abort
 * the shared request.
 */
class InFlightRegistry {
  constructor() {
    /** @type {Map<string, Promise<any>>} */
    this.map = new Map();
  }

  get(key) {
    return this.map.get(key);
  }

  set(key, promise) {
    this.map.set(key, promise);
  }

  delete(key) {
    this.map.delete(key);
  }

  clear() {
    this.map.clear();
  }
}

function safeJsonParse(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeJsonStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return null;
  }
}

function safeLocalStorageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore quota/privacy errors
  }
}

function safeLocalStorageRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

/**
 * Persist cache entry to localStorage (best effort).
 * @param {string} key
 * @param {CacheEntry} entry
 */
function persistToLocalStorage(key, entry) {
  const payload = safeJsonStringify({
    v: entry.value,
    e: entry.expiresAt,
    u: entry.updatedAt,
  });
  if (!payload) return;
  safeLocalStorageSet(`${LS_PREFIX}${key}`, payload);
}

/**
 * Load cache entry from localStorage if present.
 * @param {string} key
 * @returns {CacheEntry|null}
 */
function loadFromLocalStorage(key) {
  const raw = safeLocalStorageGet(`${LS_PREFIX}${key}`);
  const parsed = safeJsonParse(raw);
  if (!parsed || typeof parsed !== "object") return null;
  if (!("v" in parsed) || typeof parsed.e !== "number" || typeof parsed.u !== "number") {
    return null;
  }
  return {
    value: parsed.v,
    expiresAt: parsed.e,
    updatedAt: parsed.u,
  };
}

/**
 * Simple pub-sub for background refresh updates.
 */
class CacheEvents {
  constructor() {
    /** @type {Map<string, Set<(value:any)=>void>>} */
    this.listeners = new Map();
  }

  subscribe(key, cb) {
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(cb);
    return () => {
      const set = this.listeners.get(key);
      if (!set) return;
      set.delete(cb);
      if (set.size === 0) this.listeners.delete(key);
    };
  }

  emit(key, value) {
    const set = this.listeners.get(key);
    if (!set) return;
    for (const cb of set) {
      try {
        cb(value);
      } catch {
        // ignore listener errors
      }
    }
  }

  clear() {
    this.listeners.clear();
  }
}

const memoryCache = new LruTtlCache({ maxEntries: DEFAULT_MAX_ENTRIES });
const inFlight = new InFlightRegistry();
const events = new CacheEvents();

/**
 * Cache key builder helpers.
 * Keep stable and explicit to avoid accidental collisions.
 */
export const cacheKeys = {
  search: (query, limit) => `search:q=${String(query).trim().toLowerCase()}:l=${limit}`,
  suggestions: (query, limit) =>
    `suggest:q=${String(query).trim().toLowerCase()}:l=${limit}`,
  summary: (title) => `summary:t=${String(title).trim()}`,
  html: (title) => `html:t=${String(title).trim()}`,
  related: (title) => `related:t=${String(title).trim()}`,
  categories: (title, limit) => `categories:t=${String(title).trim()}:l=${limit}`,
  categoryMembers: (category, limit) =>
    `catMembers:c=${String(category).trim()}:l=${limit}`,
};

/**
 * @typedef {Object} SwrOptions
 * @property {AbortSignal=} signal Per-consumer abort signal. Aborting does not cancel shared request.
 * @property {number=} ttlMs TTL for this key.
 * @property {boolean=} persist If true, store/read from localStorage in addition to memory cache.
 * @property {(value:any, meta:{key:string, fromCache:boolean, stale:boolean})=>void=} onUpdate
 *  Called immediately if cached is served and again when background refresh completes.
 * @property {boolean=} forceRefresh If true, skip cache read and re-fetch (still de-duped by key).
 */

/**
 * Run a request with caching + SWR + de-dup.
 *
 * SWR flow:
 * - If fresh cache exists: return it immediately.
 * - If stale cache exists: return stale immediately AND start a background refresh
 *   (if not already in-flight) that updates cache and notifies subscribers/onUpdate.
 * - If no cache: await network (de-duped) and return.
 *
 * @param {string} key
 * @param {() => Promise<any>} fetcher
 * @param {SwrOptions} options
 * @returns {Promise<any>}
 */
export async function swrRequest(key, fetcher, options = {}) {
  const {
    signal,
    ttlMs = 60_000,
    persist = false,
    onUpdate,
    forceRefresh = false,
  } = options;

  const aborted = () => Boolean(signal?.aborted);

  // If consumer is already aborted, behave like fetch() with AbortSignal.
  if (aborted()) {
    const err = new DOMException("The operation was aborted.", "AbortError");
    throw err;
  }

  // Hydrate memory from localStorage on demand (only if not present in memory).
  if (persist) {
    const memStatus = memoryCache.getStatus(key);
    if (!memStatus.hit) {
      const lsEntry = loadFromLocalStorage(key);
      if (lsEntry) {
        // Insert into memory even if stale; SWR can still serve stale.
        memoryCache.map.set(key, lsEntry);
      }
    }
  }

  const status = forceRefresh ? { hit: false, stale: false } : memoryCache.getStatus(key);

  // Serve from cache (fresh or stale).
  if (status.hit) {
    if (!aborted()) {
      onUpdate?.(status.value, { key, fromCache: true, stale: status.stale });
    }

    if (!status.stale) {
      return status.value;
    }

    // Stale-while-revalidate: start background refresh, but do not await.
    void refreshInBackground(key, fetcher, { ttlMs, persist });

    return status.value;
  }

  // No cache, or forced refresh: await a (de-duped) request.
  const value = await runDeduped(key, fetcher);
  const entry = memoryCache.set(key, value, ttlMs);
  if (persist) persistToLocalStorage(key, entry);
  events.emit(key, value);

  if (!aborted()) {
    onUpdate?.(value, { key, fromCache: false, stale: false });
  }

  return value;
}

async function runDeduped(key, fetcher) {
  const existing = inFlight.get(key);
  if (existing) return existing;

  const p = (async () => {
    try {
      return await fetcher();
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, p);
  return p;
}

async function refreshInBackground(key, fetcher, { ttlMs, persist }) {
  // If already refreshing/in-flight, don't start another.
  if (inFlight.get(key)) return;

  try {
    const value = await runDeduped(key, fetcher);
    const entry = memoryCache.set(key, value, ttlMs);
    if (persist) persistToLocalStorage(key, entry);
    events.emit(key, value);
  } catch {
    // Background refresh failures are intentionally silent: UI keeps stale data.
  }
}

/**
 * Subscribe to cache updates for a key.
 * Consumers should still guard against unmounted updates.
 *
 * PUBLIC_INTERFACE
 */
export function subscribeCache(key, cb) {
  /** Subscribe to SWR background refresh updates for a key. Returns unsubscribe(). */
  return events.subscribe(key, cb);
}

/**
 * Clear all in-memory cache + in-flight registry + listeners.
 *
 * PUBLIC_INTERFACE
 */
export function clearAllCaches({ alsoLocalStorage = false } = {}) {
  /** Clears all caches. If alsoLocalStorage, attempts to delete persisted keys for this app. */
  memoryCache.clear();
  inFlight.clear();
  events.clear();

  if (alsoLocalStorage) {
    try {
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith(LS_PREFIX)) keysToRemove.push(k);
      }
      keysToRemove.forEach((k) => safeLocalStorageRemove(k));
    } catch {
      // ignore
    }
  }
}

/**
 * Delete a single cache key.
 *
 * PUBLIC_INTERFACE
 */
export function expireCacheKey(key, { alsoLocalStorage = false } = {}) {
  /** Expires a single cache key from memory and optionally localStorage. */
  memoryCache.delete(key);
  if (alsoLocalStorage) safeLocalStorageRemove(`${LS_PREFIX}${key}`);
}

/**
 * Read current cache status for UI/debug purposes.
 *
 * PUBLIC_INTERFACE
 */
export function getCacheStatus(key) {
  /** Returns {hit, stale, value, expiresAt, updatedAt} for a cache key. */
  return memoryCache.getStatus(key);
}
