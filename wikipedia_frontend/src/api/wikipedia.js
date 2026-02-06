import { cacheKeys, expireCacheKey, getCacheStatus, subscribeCache, swrRequest, TTL } from "./cache";

const DEFAULT_WIKI_BASE = "https://en.wikipedia.org";

/**
 * NOTE: This app can optionally use REACT_APP_API_BASE as the Wikipedia base URL.
 * In this template .env, REACT_APP_API_BASE might point to a backend. We do not
 * depend on a backend, but if it is set to a Wikipedia domain (or proxy),
 * we will prefer it.
 */
const WIKI_BASE =
  (process.env.REACT_APP_API_BASE && process.env.REACT_APP_API_BASE.trim()) ||
  DEFAULT_WIKI_BASE;

// Some endpoints are on REST, others on MediaWiki Action API.
const REST_BASE = `${WIKI_BASE.replace(/\/$/, "")}/api/rest_v1`;
const ACTION_API = `${WIKI_BASE.replace(/\/$/, "")}/w/api.php`;

// PUBLIC_INTERFACE
export function getWikipediaBaseUrl() {
  /** Returns the configured Wikipedia base URL used by the API layer. */
  return WIKI_BASE;
}

/**
 * Small fetch helpers used by the API layer.
 * Accept an optional AbortSignal so callers can cancel in-flight requests.
 */
async function fetchJson(url, options = {}) {
  const { signal } = options;
  const res = await fetch(url, {
    signal,
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Wikipedia request failed (${res.status})`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res.json();
}

async function fetchText(url, options = {}) {
  const { signal } = options;
  const res = await fetch(url, {
    signal,
    headers: { Accept: "text/html" },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Wikipedia request failed (${res.status})`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res.text();
}

function buildActionApiUrl(params) {
  const url = new URL(ACTION_API);
  // CORS: MediaWiki API supports origin=*
  url.searchParams.set("origin", "*");
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  return url.toString();
}

/**
 * @typedef {Object} WikipediaRequestOptions
 * @property {AbortSignal=} signal Optional AbortSignal to cancel the request (per-consumer).
 * @property {(value:any, meta:{key:string, fromCache:boolean, stale:boolean})=>void=} onUpdate
 *   Optional SWR update callback. If stale cache is returned, onUpdate will fire again after refresh.
 * @property {boolean=} forceRefresh If true, bypass cache and fetch network (still de-duped by key).
 * @property {boolean=} persist If true, also read/write this key from localStorage (best-effort).
 */

/**
 * Phase 3 caching notes:
 * - Keys are defined in src/api/cache.js (cacheKeys.*).
 * - TTLs are defined in src/api/cache.js (TTL.*).
 * - SWR behavior:
 *    - fresh: return cached
 *    - stale: return stale immediately, refresh in background, notify via onUpdate/subscribe
 *    - miss: fetch (de-duped), then cache
 */

// PUBLIC_INTERFACE
export async function searchPages(query, limit = 20, options = {}) {
  /** Search for pages using MediaWiki Action API with caching + SWR + de-dupe. */
  const q = String(query || "").trim();
  const key = cacheKeys.search(q, limit);

  const url = buildActionApiUrl({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: q,
    gsrlimit: limit,
    prop: "pageimages|description|extracts",
    exintro: 1,
    explaintext: 1,
    exsentences: 2,
    piprop: "thumbnail",
    pithumbsize: 320,
    pilimit: limit,
  });

  const fetcher = async () => {
    const data = await fetchJson(url, { signal: options.signal });
    const pages = Object.values(data?.query?.pages || {});
    // generator search returns unsorted object; sort by index if present.
    pages.sort((a, b) => (a?.index ?? 0) - (b?.index ?? 0));

    return pages.map((p) => ({
      pageid: p.pageid,
      title: p.title,
      description: p.description || "",
      extract: p.extract || "",
      thumbnail: p.thumbnail?.source || "",
    }));
  };

  return swrRequest(key, fetcher, {
    signal: options.signal,
    ttlMs: TTL.search,
    persist: options.persist ?? true, // searches are good candidates for persistence
    onUpdate: options.onUpdate,
    forceRefresh: options.forceRefresh,
  });
}

// PUBLIC_INTERFACE
export async function getSearchSuggestions(query, limit = 8, options = {}) {
  /** Get typeahead suggestions (OpenSearch). Caching is helpful but short TTL. */
  const q = String(query || "").trim();
  const key = cacheKeys.suggestions(q, limit);

  const url = buildActionApiUrl({
    action: "opensearch",
    format: "json",
    search: q,
    limit,
    namespace: 0,
  });

  const fetcher = async () => {
    const data = await fetchJson(url, { signal: options.signal });
    // Response: [searchterm, [titles], [descriptions], [links]]
    const titles = Array.isArray(data) ? data[1] : [];
    return titles.map((t) => String(t));
  };

  return swrRequest(key, fetcher, {
    signal: options.signal,
    ttlMs: TTL.suggestions,
    persist: options.persist ?? false,
    onUpdate: options.onUpdate,
    forceRefresh: options.forceRefresh,
  });
}

// PUBLIC_INTERFACE
export async function getArticleSummary(title, options = {}) {
  /** Fetch article summary via REST API with caching + SWR + de-dupe. */
  const t = String(title || "").trim();
  const key = cacheKeys.summary(t);
  const url = `${REST_BASE}/page/summary/${encodeURIComponent(t)}`;

  const fetcher = async () => fetchJson(url, { signal: options.signal });

  return swrRequest(key, fetcher, {
    signal: options.signal,
    ttlMs: TTL.summary,
    persist: options.persist ?? true, // summaries are small and "hot"
    onUpdate: options.onUpdate,
    forceRefresh: options.forceRefresh,
  });
}

// PUBLIC_INTERFACE
export async function getArticleHtml(title, options = {}) {
  /** Fetch full article HTML via REST API with caching + SWR + de-dupe. */
  const t = String(title || "").trim();
  const key = cacheKeys.html(t);
  const url = `${REST_BASE}/page/html/${encodeURIComponent(t)}`;

  const fetcher = async () => fetchText(url, { signal: options.signal });

  return swrRequest(key, fetcher, {
    signal: options.signal,
    ttlMs: TTL.html,
    // HTML is big; avoid localStorage persistence by default.
    persist: options.persist ?? false,
    onUpdate: options.onUpdate,
    forceRefresh: options.forceRefresh,
  });
}

// PUBLIC_INTERFACE
export async function getArticleRelated(title, options = {}) {
  /** Fetch related pages via REST API with caching + SWR + de-dupe. */
  const t = String(title || "").trim();
  const key = cacheKeys.related(t);
  const url = `${REST_BASE}/page/related/${encodeURIComponent(t)}`;

  const fetcher = async () => {
    const data = await fetchJson(url, { signal: options.signal });
    const pages = data?.pages || [];
    return pages.map((p) => ({
      title: p.title,
      extract: p.extract || "",
      thumbnail: p.thumbnail?.source || "",
      description: p.description || "",
    }));
  };

  return swrRequest(key, fetcher, {
    signal: options.signal,
    ttlMs: TTL.related,
    persist: options.persist ?? false,
    onUpdate: options.onUpdate,
    forceRefresh: options.forceRefresh,
  });
}

// PUBLIC_INTERFACE
export async function getArticleCategories(title, limit = 20, options = {}) {
  /** Fetch categories for an article via Action API with caching + SWR + de-dupe. */
  const t = String(title || "").trim();
  const key = cacheKeys.categories(t, limit);

  const url = buildActionApiUrl({
    action: "query",
    format: "json",
    titles: t,
    prop: "categories",
    cllimit: limit,
  });

  const fetcher = async () => {
    const data = await fetchJson(url, { signal: options.signal });
    const pages = Object.values(data?.query?.pages || {});
    const page = pages[0];
    const categories = page?.categories || [];
    return categories
      .map((c) => String(c.title || ""))
      .filter(Boolean)
      .map((x) => x.replace(/^Category:/, ""));
  };

  return swrRequest(key, fetcher, {
    signal: options.signal,
    ttlMs: TTL.categories,
    persist: options.persist ?? false,
    onUpdate: options.onUpdate,
    forceRefresh: options.forceRefresh,
  });
}

// PUBLIC_INTERFACE
export async function getCategoryMembers(category, limit = 30, options = {}) {
  /** Fetch members of a category via Action API with caching + SWR + de-dupe. */
  const c = String(category || "").trim();
  const key = cacheKeys.categoryMembers(c, limit);

  const url = buildActionApiUrl({
    action: "query",
    format: "json",
    list: "categorymembers",
    cmtitle: `Category:${c}`,
    cmlimit: limit,
    cmnamespace: 0,
  });

  const fetcher = async () => {
    const data = await fetchJson(url, { signal: options.signal });
    const members = data?.query?.categorymembers || [];
    return members.map((m) => ({
      pageid: m.pageid,
      title: m.title,
    }));
  };

  return swrRequest(key, fetcher, {
    signal: options.signal,
    ttlMs: TTL.categoryMembers,
    persist: options.persist ?? false,
    onUpdate: options.onUpdate,
    forceRefresh: options.forceRefresh,
  });
}

/**
 * Phase 3 cache utilities (optional for pages).
 */

// PUBLIC_INTERFACE
export function getSearchCacheKey(query, limit = 20) {
  /** Returns the cache key used for a given search query+limit. */
  return cacheKeys.search(String(query || "").trim(), limit);
}

// PUBLIC_INTERFACE
export function getArticleCacheKeys(title) {
  /** Returns the cache keys used for an article's main resources (summary/html/related). */
  const t = String(title || "").trim();
  return {
    summary: cacheKeys.summary(t),
    html: cacheKeys.html(t),
    related: cacheKeys.related(t),
  };
}

// PUBLIC_INTERFACE
export function subscribeWikipediaCache(key, cb) {
  /** Subscribe to background refresh updates for a key. Returns unsubscribe(). */
  return subscribeCache(key, cb);
}

// PUBLIC_INTERFACE
export function expireWikipediaCacheKey(key, options = {}) {
  /** Expire a specific key from cache (and optionally localStorage). */
  return expireCacheKey(key, options);
}

// PUBLIC_INTERFACE
export function getWikipediaCacheStatus(key) {
  /** Get cache hit/stale metadata for UI/debug (does not fetch). */
  return getCacheStatus(key);
}
