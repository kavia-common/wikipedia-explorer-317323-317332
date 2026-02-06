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

async function fetchJson(url) {
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Wikipedia request failed (${res.status})`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { "Accept": "text/html" } });
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

// PUBLIC_INTERFACE
export async function searchPages(query, limit = 20) {
  /** Search for pages using MediaWiki Action API. */
  const url = buildActionApiUrl({
    action: "query",
    format: "json",
    generator: "search",
    gsrsearch: query,
    gsrlimit: limit,
    prop: "pageimages|description|extracts",
    exintro: 1,
    explaintext: 1,
    exsentences: 2,
    piprop: "thumbnail",
    pithumbsize: 320,
    pilimit: limit,
  });

  const data = await fetchJson(url);
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
}

// PUBLIC_INTERFACE
export async function getSearchSuggestions(query, limit = 8) {
  /** Get typeahead suggestions (OpenSearch). */
  const url = buildActionApiUrl({
    action: "opensearch",
    format: "json",
    search: query,
    limit,
    namespace: 0,
  });

  const data = await fetchJson(url);
  // Response: [searchterm, [titles], [descriptions], [links]]
  const titles = Array.isArray(data) ? data[1] : [];
  return titles.map((t) => String(t));
}

// PUBLIC_INTERFACE
export async function getArticleSummary(title) {
  /** Fetch article summary (title, description, extract, thumbnail) via REST API. */
  const url = `${REST_BASE}/page/summary/${encodeURIComponent(title)}`;
  return fetchJson(url);
}

// PUBLIC_INTERFACE
export async function getArticleHtml(title) {
  /** Fetch full article HTML via REST API. */
  const url = `${REST_BASE}/page/html/${encodeURIComponent(title)}`;
  return fetchText(url);
}

// PUBLIC_INTERFACE
export async function getArticleRelated(title) {
  /** Fetch related pages via REST API. */
  const url = `${REST_BASE}/page/related/${encodeURIComponent(title)}`;
  const data = await fetchJson(url);
  const pages = data?.pages || [];
  return pages.map((p) => ({
    title: p.title,
    extract: p.extract || "",
    thumbnail: p.thumbnail?.source || "",
    description: p.description || "",
  }));
}

// PUBLIC_INTERFACE
export async function getArticleCategories(title, limit = 20) {
  /** Fetch categories for an article via Action API. */
  const url = buildActionApiUrl({
    action: "query",
    format: "json",
    titles: title,
    prop: "categories",
    cllimit: limit,
  });

  const data = await fetchJson(url);
  const pages = Object.values(data?.query?.pages || {});
  const page = pages[0];
  const categories = page?.categories || [];
  return categories
    .map((c) => String(c.title || ""))
    .filter(Boolean)
    .map((t) => t.replace(/^Category:/, ""));
}

// PUBLIC_INTERFACE
export async function getCategoryMembers(category, limit = 30) {
  /** Fetch members of a category via Action API. */
  const url = buildActionApiUrl({
    action: "query",
    format: "json",
    list: "categorymembers",
    cmtitle: `Category:${category}`,
    cmlimit: limit,
    cmnamespace: 0,
  });

  const data = await fetchJson(url);
  const members = data?.query?.categorymembers || [];
  return members.map((m) => ({
    pageid: m.pageid,
    title: m.title,
  }));
}
