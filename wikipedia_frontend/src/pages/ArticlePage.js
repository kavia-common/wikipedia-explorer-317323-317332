import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import {
  getArticleCacheKeys,
  getArticleCategories,
  getArticleHtml,
  getArticleRelated,
  getArticleSummary,
  getWikipediaCacheStatus,
  subscribeWikipediaCache,
} from "../api/wikipedia";
import ArticleCard from "../components/ArticleCard";
import CategoryList from "../components/CategoryList";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import { sanitizeWikipediaHtml } from "../utils/sanitizeHtml";
import { addRecentArticleTitle } from "../pwa/offlineRecents";
import styles from "./ArticlePage.module.css";

/**
 * Create a stable, URL-safe ID from a heading's text.
 * - IDs are deterministic and remain stable across renders
 * - Limited to [a-z0-9-_] to avoid weird URL/hash edge cases
 */
function slugifyHeading(text) {
  const raw = String(text || "").trim().toLowerCase();
  if (!raw) return "section";
  const slug = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
  return slug || "section";
}

function isReferencesHeading(text) {
  const raw = String(text || "").trim().toLowerCase();
  if (!raw) return false;
  // Common Wikipedia section names; keep simple and safe (no regex backtracking risks).
  return (
    raw === "references" ||
    raw === "referencias" ||
    raw === "références" ||
    raw === "bibliography" ||
    raw === "bibliografía" ||
    raw === "notes" ||
    raw === "notas"
  );
}

/**
 * Post-process sanitized HTML in a detached container.
 * Security note: we never introduce new untrusted HTML; we only:
 * - add safe attributes (id, data-*, aria-*)
 * - wrap existing nodes in new divs
 * - add safe anchor tags with hash hrefs
 */
function buildRenderModelFromSanitizedHtml(safeHtml) {
  const container = document.createElement("div");
  container.innerHTML = safeHtml || "";

  const headings = Array.from(container.querySelectorAll("h2, h3, h4"));
  const usedIds = new Set();
  const toc = [];

  headings.forEach((h) => {
    const level = Number(String(h.tagName || "").slice(1));
    if (![2, 3, 4].includes(level)) return;

    // Prefer existing id, otherwise derive from visible text.
    const existing = String(h.getAttribute("id") || "").trim();
    let base = existing ? existing : slugifyHeading(h.textContent || "");
    // Ensure safe characters only.
    base = base.replace(/[^A-Za-z0-9\-_:.]/g, "-");

    let id = base;
    let n = 2;
    while (!id || usedIds.has(id)) {
      id = `${base}-${n}`;
      n += 1;
    }
    usedIds.add(id);

    // Only set if missing to avoid breaking existing internal links.
    if (!existing) h.setAttribute("id", id);

    toc.push({
      id,
      level,
      text: String(h.textContent || "").trim(),
    });
  });

  // References UX:
  // Find a references section heading and wrap all following siblings until next same-or-higher heading.
  let references = null;
  for (const h of headings) {
    if (!isReferencesHeading(h.textContent || "")) continue;

    const refLevel = Number(String(h.tagName).slice(1));
    const wrapper = document.createElement("div");
    wrapper.setAttribute("data-references-wrapper", "true");

    // Move heading + its section content into wrapper.
    const start = h;
    const parent = start.parentNode;
    if (!parent) break;

    const nodesToMove = [start];
    let cursor = start.nextSibling;

    while (cursor) {
      // Stop at next heading of same or higher level
      if (
        cursor.nodeType === 1 &&
        /^h[2-6]$/i.test(cursor.tagName || "") &&
        Number(String(cursor.tagName).slice(1)) <= refLevel
      ) {
        break;
      }
      nodesToMove.push(cursor);
      cursor = cursor.nextSibling;
    }

    nodesToMove.forEach((node) => wrapper.appendChild(node));
    parent.insertBefore(wrapper, cursor || null);

    references = { wrapperEl: wrapper };
    break;
  }

  // Add in-text citation handling:
  // - For <sup><a href="#cite_note-...">...</a></sup> ensure the link is marked for JS handling.
  // - For references list entries that already have IDs (common on Wikipedia), add backlinks to the invoking sup if possible.
  const citeLinks = Array.from(container.querySelectorAll('sup a[href^="#"]'));
  citeLinks.forEach((a) => {
    const href = String(a.getAttribute("href") || "");
    const targetId = href.slice(1);
    if (!targetId) return;

    // Mark as citation jump.
    a.setAttribute("data-cite-target", targetId);

    // Ensure the sup has an id so references can link back.
    const sup = a.closest("sup");
    if (sup) {
      const supId = sup.getAttribute("id");
      if (!supId) {
        const seed = `cite-ref-${targetId}`;
        let id = seed;
        let n = 2;
        while (usedIds.has(id)) {
          id = `${seed}-${n}`;
          n += 1;
        }
        usedIds.add(id);
        sup.setAttribute("id", id);
      }
      // Store sup id on link for reference-side backlink attempts.
      a.setAttribute("data-cite-source", sup.getAttribute("id") || "");
    }
  });

  // For reference items, attempt to add a "back to text" link pointing to the first source sup.
  // Wikipedia commonly uses <li id="cite_note-..."> or similar.
  const refItems = Array.from(container.querySelectorAll('li[id^="cite_note"], li[id^="cite_note-"], li[id^="cite_note_"]'));
  refItems.forEach((li) => {
    const id = String(li.getAttribute("id") || "");
    if (!id) return;

    // Find a corresponding in-text citation link targeting this id.
    const matching = citeLinks.find((a) => String(a.getAttribute("data-cite-target") || "") === id);
    const sourceId = matching ? String(matching.getAttribute("data-cite-source") || "") : "";
    if (!sourceId) return;

    // Avoid adding duplicates if SWR rerenders.
    if (li.querySelector(`a[href="#${CSS.escape(sourceId)}"][data-backlink="true"]`)) return;

    const back = document.createElement("a");
    back.setAttribute("href", `#${sourceId}`);
    back.setAttribute("data-backlink", "true");
    back.className = "wikiBacklink";
    back.textContent = "↩";
    // Keep it minimal; label will be provided by aria-label in React via CSS ::after not possible.
    back.setAttribute("aria-label", "Back to text");

    // Append with spacing.
    const spacer = document.createTextNode(" ");
    li.appendChild(spacer);
    li.appendChild(back);
  });

  // Improve table responsiveness without altering sanitized rules:
  // Wrap each table in an overflow container.
  const tables = Array.from(container.querySelectorAll("table"));
  tables.forEach((table) => {
    const wrap = document.createElement("div");
    wrap.className = "wikiTableWrap";
    table.parentNode?.insertBefore(wrap, table);
    wrap.appendChild(table);

    // Mark header cells so CSS can do sticky headers.
    const ths = Array.from(table.querySelectorAll("th"));
    ths.forEach((th) => th.setAttribute("data-sticky-th", "true"));
  });

  return {
    html: container.innerHTML,
    toc,
    hasReferences: Boolean(references),
  };
}

// PUBLIC_INTERFACE
export default function ArticlePage() {
  /** Displays a Wikipedia article by title. */
  const { t } = useTranslation();
  const { title: encodedTitle } = useParams();
  const location = useLocation();
  const title = useMemo(() => decodeURIComponent(encodedTitle || ""), [encodedTitle]);

  const fromCategory = location.state?.fromCategory
    ? {
        name: String(location.state.fromCategory.name || ""),
        title: String(location.state.fromCategory.title || location.state.fromCategory.name || ""),
        path: String(location.state.fromCategory.path || ""),
        restoreScrollY:
          typeof location.state.fromCategory.restoreScrollY === "number"
            ? location.state.fromCategory.restoreScrollY
            : null,
      }
    : null;

  const [summary, setSummary] = useState(null);
  const [html, setHtml] = useState("");
  const [categories, setCategories] = useState([]);
  const [related, setRelated] = useState([]);

  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Used to ignore late updates when navigating quickly between articles.
  const activeKeysRef = useRef({ summary: "", html: "", related: "" });

  const articleRootRef = useRef(null);
  const lastProcessedSafeHtmlRef = useRef("");
  const pendingHashScrollRef = useRef(null);

  const [tocOpenMobile, setTocOpenMobile] = useState(false);
  const [referencesOpen, setReferencesOpen] = useState(true);

  useEffect(() => {
    if (!title) return;

    // Track last-viewed content so users can return offline.
    addRecentArticleTitle(title, { max: 8 });

    const controller = new AbortController();
    let active = true;

    setError("");
    setIsRefreshing(false);

    const keys = getArticleCacheKeys(title, { lang: i18n.language });
    activeKeysRef.current = keys;

    // If we have cached data, show it immediately and allow SWR to refresh in background.
    const sStatus = getWikipediaCacheStatus(keys.summary);
    const hStatus = getWikipediaCacheStatus(keys.html);
    const rStatus = getWikipediaCacheStatus(keys.related);

    const hasAnyCached = Boolean(sStatus.hit || hStatus.hit || rStatus.hit);
    const anyStale = Boolean(
      (sStatus.hit && sStatus.stale) ||
        (hStatus.hit && hStatus.stale) ||
        (rStatus.hit && rStatus.stale)
    );

    if (hasAnyCached) {
      if (sStatus.hit) setSummary(sStatus.value);
      if (hStatus.hit) setHtml(hStatus.value);
      if (rStatus.hit && Array.isArray(rStatus.value)) setRelated(rStatus.value.slice(0, 8));
      setStatus("success");
      setIsRefreshing(anyStale);
    } else {
      setStatus("loading");
      setSummary(null);
      setHtml("");
      setCategories([]);
      setRelated([]);
    }

    // Subscribe to SWR updates for the main article resources.
    const unsubSummary = subscribeWikipediaCache(keys.summary, (value) => {
      if (!active) return;
      if (controller.signal.aborted) return;
      if (activeKeysRef.current.summary !== keys.summary) return;
      setSummary(value);
      setIsRefreshing(false);
    });

    const unsubHtml = subscribeWikipediaCache(keys.html, (value) => {
      if (!active) return;
      if (controller.signal.aborted) return;
      if (activeKeysRef.current.html !== keys.html) return;
      setHtml(value || "");
      setIsRefreshing(false);
    });

    const unsubRelated = subscribeWikipediaCache(keys.related, (value) => {
      if (!active) return;
      if (controller.signal.aborted) return;
      if (activeKeysRef.current.related !== keys.related) return;
      if (!Array.isArray(value)) return;
      setRelated(value.slice(0, 8));
      setIsRefreshing(false);
    });

    (async () => {
      try {
        // Categories are smaller and not persisted; fetch alongside (SWR still applies).
        const [s, h, c, r] = await Promise.all([
          getArticleSummary(title, {
            signal: controller.signal,
            lang: i18n.language,
            persist: true,
            onUpdate: (value, meta) => {
              if (!active) return;
              if (controller.signal.aborted) return;
              if (activeKeysRef.current.summary !== keys.summary) return;
              setSummary(value);
              setIsRefreshing(meta.stale);
            },
          }),
          getArticleHtml(title, {
            signal: controller.signal,
            lang: i18n.language,
            onUpdate: (value, meta) => {
              if (!active) return;
              if (controller.signal.aborted) return;
              if (activeKeysRef.current.html !== keys.html) return;
              setHtml(value || "");
              setIsRefreshing(meta.stale);
            },
          }),
          getArticleCategories(title, 25, { signal: controller.signal, lang: i18n.language }),
          getArticleRelated(title, {
            signal: controller.signal,
            lang: i18n.language,
            onUpdate: (value, meta) => {
              if (!active) return;
              if (controller.signal.aborted) return;
              if (activeKeysRef.current.related !== keys.related) return;
              if (!Array.isArray(value)) return;
              setRelated(value.slice(0, 8));
              setIsRefreshing(meta.stale);
            },
          }),
        ]);

        if (!active) return;
        if (controller.signal.aborted) return;
        if (activeKeysRef.current.summary !== keys.summary) return;

        setSummary(s);
        setHtml(h || "");
        setCategories(c);
        setRelated((r || []).slice(0, 8));
        setStatus("success");
        setIsRefreshing(false);
      } catch (e) {
        if (!active) return;
        if (e?.name === "AbortError") return;

        setStatus("error");
        setIsRefreshing(false);
        setError(e?.message || "Failed to load article.");
      }
    })();

    return () => {
      active = false;
      controller.abort();
      unsubSummary?.();
      unsubHtml?.();
      unsubRelated?.();
    };
  }, [title]);

  // Mobile defaults: collapse TOC and references.
  useEffect(() => {
    const isMobile =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(max-width: 640px)").matches
        : false;
    setTocOpenMobile(false);
    setReferencesOpen(!isMobile);
  }, [title]);

  const safeHtml = useMemo(() => sanitizeWikipediaHtml(html), [html]);

  // Derived render model (TOC + post-processed HTML) with O(#headings) work.
  const renderModel = useMemo(() => {
    // In SSR/tests without DOM, just pass-through.
    if (typeof document === "undefined") {
      return { html: safeHtml, toc: [], hasReferences: false };
    }

    // Avoid re-processing if SWR background update didn't change content.
    if (lastProcessedSafeHtmlRef.current === safeHtml) {
      return pendingHashScrollRef.current?.model || { html: safeHtml, toc: [], hasReferences: false };
    }

    const model = buildRenderModelFromSanitizedHtml(safeHtml);
    lastProcessedSafeHtmlRef.current = safeHtml;
    // Keep last model for hash-scroll effect usage without extra parsing.
    pendingHashScrollRef.current = { model };
    return model;
  }, [safeHtml]);

  // Handle initial hash navigation after content render, and any hash changes.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const run = () => {
      const hash = String(window.location.hash || "");
      if (!hash || hash.length < 2) return;
      const id = hash.slice(1);

      // Only scroll within the article root to avoid collisions.
      const root = articleRootRef.current;
      if (!root) return;
      const target = root.querySelector(`#${CSS.escape(id)}`);
      if (!target) return;

      // Use rAF to wait until layout stabilizes; keeps SWR updates from janking.
      requestAnimationFrame(() => {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    };

    run();
    window.addEventListener("hashchange", run);
    return () => window.removeEventListener("hashchange", run);
  }, [renderModel.html, title]);

  const tocItems = renderModel.toc || [];
  const hasToc = tocItems.length > 0;
  const hasReferences = Boolean(renderModel.hasReferences);

  function scrollToId(id) {
    const root = articleRootRef.current;
    if (!root) return;
    const target = root.querySelector(`#${CSS.escape(id)}`);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function handleTocClick(e, id) {
    e.preventDefault();
    scrollToId(id);
    // Update hash without full reload.
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
    }
  }

  function handleArticleClick(e) {
    const a = e.target?.closest?.("a");
    if (!a) return;

    const href = String(a.getAttribute("href") || "");
    // Only handle in-page hash navigation; do not interfere with other links.
    if (!href.startsWith("#") || href.length < 2) return;

    const id = href.slice(1);
    const root = articleRootRef.current;
    if (!root) return;
    const target = root.querySelector(`#${CSS.escape(id)}`);
    if (!target) return;

    e.preventDefault();
    scrollToId(id);
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `#${id}`);
    }
  }

  function toggleReferencesCollapsed() {
    setReferencesOpen((v) => !v);
  }

  if (status === "loading") {
    return <LoadingState title={t("article.loading")} />;
  }

  if (status === "error") {
    return (
      <ErrorState
        title={t("article.unableToLoad", { title })}
        description={error || t("article.failedToLoad")}
        onRetry={() => setStatus("loading")}
        retryLabel={t("common.tryAgain")}
      />
    );
  }

  const leadImage = summary?.thumbnail?.source || summary?.originalimage?.source || "";

  return (
    <div className={styles.layout}>
      <main className={styles.main}>
        {fromCategory?.name ? (
          <nav className={styles.breadcrumbs} aria-label={t("common.breadcrumb")}>
            <Link className={styles.crumbLink} to="/">
              {t("article.breadcrumbs.home")}
            </Link>
            <span className={styles.crumbSep} aria-hidden="true">
              /
            </span>
            <Link
              className={styles.crumbLink}
              to={fromCategory.path || `/category/${encodeURIComponent(fromCategory.name)}`}
              state={{
                restoreScrollY: fromCategory.restoreScrollY,
              }}
            >
              {t("article.breadcrumbs.categoryPrefix", {
                category: fromCategory.title || fromCategory.name,
              })}
            </Link>
            <span className={styles.crumbSep} aria-hidden="true">
              /
            </span>
            <span className={styles.crumbCurrent}>{t("article.breadcrumbs.article")}</span>
          </nav>
        ) : null}

        <div className={styles.top}>
          <h1 className={styles.title}>{summary?.title || title}</h1>
          {summary?.description ? (
            <div className={styles.description}>
              {summary.description}
              {typeof navigator !== "undefined" && navigator.onLine === false
                ? ` • ${t("offline.cached")}`
                : null}
              {isRefreshing ? ` • ${t("common.updating")}` : null}
            </div>
          ) : isRefreshing ? (
            <div className={styles.description}>
              {typeof navigator !== "undefined" && navigator.onLine === false
                ? t("offline.cached")
                : t("common.updating")}
            </div>
          ) : typeof navigator !== "undefined" && navigator.onLine === false ? (
            <div className={styles.description}>{t("offline.cached")}</div>
          ) : null}
        </div>

        {leadImage ? <img className={styles.leadImage} src={leadImage} alt="" /> : null}

        {summary?.extract ? <div className={styles.extract}>{summary.extract}</div> : null}

        {hasToc ? (
          <section className={styles.tocMobile} aria-label={t("articleFidelity.tocAriaLabel")}>
            <button
              type="button"
              className={styles.tocToggle}
              aria-expanded={tocOpenMobile}
              onClick={() => setTocOpenMobile((v) => !v)}
            >
              {tocOpenMobile ? t("articleFidelity.tocToggleHide") : t("articleFidelity.tocToggleShow")}
            </button>
            {tocOpenMobile ? (
              <nav className={styles.tocNav} aria-label={t("articleFidelity.tocAriaLabel")}>
                <div className={styles.tocTitle}>{t("articleFidelity.tocTitle")}</div>
                <ol className={styles.tocList}>
                  {tocItems.map((it) => (
                    <li key={it.id} className={styles[`tocL${it.level}`] || styles.tocL2}>
                      <a
                        href={`#${it.id}`}
                        className={styles.tocLink}
                        onClick={(e) => {
                          handleTocClick(e, it.id);
                          setTocOpenMobile(false);
                        }}
                      >
                        {it.text}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            ) : null}
          </section>
        ) : null}

        <div
          ref={articleRootRef}
          className={styles.articleHtml}
          onClick={handleArticleClick}
          // Sanitized before injection; post-processed in a detached container only.
          dangerouslySetInnerHTML={{ __html: renderModel.html }}
        />

        {hasReferences ? (
          <section className={styles.referencesControls} aria-label={t("articleFidelity.referencesAriaLabel")}>
            <button
              type="button"
              className={styles.referencesToggle}
              aria-expanded={referencesOpen}
              onClick={toggleReferencesCollapsed}
            >
              {referencesOpen ? t("articleFidelity.collapse") : t("articleFidelity.expand")}{" "}
              {t("articleFidelity.referencesTitle")}
            </button>
            {/* CSS will hide/show the actual references wrapper based on this data attribute */}
            <div
              className={styles.referencesState}
              data-references-open={referencesOpen ? "true" : "false"}
            />
          </section>
        ) : null}

        <div className={styles.bottomMeta}>
          <div className={styles.metaTitle}>{t("article.categories")}</div>
          {categories.length > 0 ? (
            <CategoryList
              categories={categories}
              linkState={{
                fromArticle: {
                  title: summary?.title || title,
                },
              }}
            />
          ) : (
            <div className={styles.metaEmpty}>{t("article.noCategories")}</div>
          )}
        </div>
      </main>

      <aside className={styles.sidebar}>
        {hasToc ? (
          <nav className={styles.tocDesktop} aria-label={t("articleFidelity.tocAriaLabel")}>
            <div className={styles.sideCard}>
              <div className={styles.tocTitle}>{t("articleFidelity.tocTitle")}</div>
              <ol className={styles.tocList}>
                {tocItems.map((it) => (
                  <li key={it.id} className={styles[`tocL${it.level}`] || styles.tocL2}>
                    <a
                      href={`#${it.id}`}
                      className={styles.tocLink}
                      onClick={(e) => handleTocClick(e, it.id)}
                    >
                      {it.text}
                    </a>
                  </li>
                ))}
              </ol>
            </div>
          </nav>
        ) : null}

        <div className={styles.sideCard}>
          <div className={styles.sideHeader}>
            <div className={styles.sideTitle}>{t("article.related")}</div>
            <Link className={styles.sideLink} to={`/search?q=${encodeURIComponent(title)}`}>
              {t("article.searchSimilar")}
            </Link>
          </div>

          {related.length === 0 ? (
            <div className={styles.metaEmpty}>{t("article.noRelated")}</div>
          ) : (
            <div className={styles.relatedList}>
              {related.map((r) => (
                <ArticleCard
                  key={r.title}
                  title={r.title}
                  extract={r.extract}
                  description={r.description}
                  thumbnail={r.thumbnail}
                />
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
