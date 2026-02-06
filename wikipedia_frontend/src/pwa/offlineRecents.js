/**
 * Track "last viewed" items for offline support (bounded, best-effort).
 *
 * Note: This complements the existing API layer cache (Phase 3).
 * The service worker will also cache the corresponding API responses.
 */

const LS_ARTICLES_KEY = "wiki_offline_recent_articles_v1";
const LS_SEARCHES_KEY = "wiki_offline_recent_searches_v1";

const DEFAULT_MAX = 8;

function safeParse(raw) {
  try {
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function safeRead(key) {
  try {
    const parsed = safeParse(localStorage.getItem(key));
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function safeWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota/privacy errors
  }
}

function addRecent(key, value, { max = DEFAULT_MAX } = {}) {
  const v = String(value || "").trim();
  if (!v) return;

  const cur = safeRead(key);
  const next = [v, ...cur.filter((x) => x.toLowerCase() !== v.toLowerCase())].slice(
    0,
    max
  );
  safeWrite(key, next);
}

// PUBLIC_INTERFACE
export function addRecentArticleTitle(title, options = {}) {
  /** Add an article title to the "recently viewed" list (for offline support). */
  addRecent(LS_ARTICLES_KEY, title, options);
}

// PUBLIC_INTERFACE
export function addRecentSearchQuery(query, options = {}) {
  /** Add a search query to the "recently viewed" list (for offline support). */
  addRecent(LS_SEARCHES_KEY, query, options);
}

// PUBLIC_INTERFACE
export function getRecentArticleTitles() {
  /** Get list of recent article titles. */
  return safeRead(LS_ARTICLES_KEY);
}

// PUBLIC_INTERFACE
export function getRecentSearchQueries() {
  /** Get list of recent search queries. */
  return safeRead(LS_SEARCHES_KEY);
}
