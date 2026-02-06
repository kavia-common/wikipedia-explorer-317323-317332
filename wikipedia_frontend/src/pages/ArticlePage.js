import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
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
import styles from "./ArticlePage.module.css";

// PUBLIC_INTERFACE
export default function ArticlePage() {
  /** Displays a Wikipedia article by title. */
  const { title: encodedTitle } = useParams();
  const title = useMemo(() => decodeURIComponent(encodedTitle || ""), [encodedTitle]);

  const [summary, setSummary] = useState(null);
  const [html, setHtml] = useState("");
  const [categories, setCategories] = useState([]);
  const [related, setRelated] = useState([]);

  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Used to ignore late updates when navigating quickly between articles.
  const activeKeysRef = useRef({ summary: "", html: "", related: "" });

  useEffect(() => {
    if (!title) return;

    const controller = new AbortController();
    let active = true;

    setError("");
    setIsRefreshing(false);

    const keys = getArticleCacheKeys(title);
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
            onUpdate: (value, meta) => {
              if (!active) return;
              if (controller.signal.aborted) return;
              if (activeKeysRef.current.html !== keys.html) return;
              setHtml(value || "");
              setIsRefreshing(meta.stale);
            },
          }),
          getArticleCategories(title, 25, { signal: controller.signal }),
          getArticleRelated(title, {
            signal: controller.signal,
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

  if (status === "loading") {
    return <LoadingState title="Loading article…" />;
  }

  if (status === "error") {
    return (
      <ErrorState
        title={`Unable to load “${title}”.`}
        description={error}
        onRetry={() => setStatus("loading")}
        retryLabel="Try again"
      />
    );
  }

  const leadImage = summary?.thumbnail?.source || summary?.originalimage?.source || "";
  const safeHtml = sanitizeWikipediaHtml(html);

  return (
    <div className={styles.layout}>
      <main className={styles.main}>
        <div className={styles.top}>
          <h1 className={styles.title}>{summary?.title || title}</h1>
          {summary?.description ? (
            <div className={styles.description}>
              {summary.description}
              {isRefreshing ? " • Updating…" : null}
            </div>
          ) : isRefreshing ? (
            <div className={styles.description}>Updating…</div>
          ) : null}
        </div>

        {leadImage ? <img className={styles.leadImage} src={leadImage} alt="" /> : null}

        {summary?.extract ? <div className={styles.extract}>{summary.extract}</div> : null}

        <div
          className={styles.articleHtml}
          // Sanitized before injection.
          dangerouslySetInnerHTML={{ __html: safeHtml }}
        />

        <div className={styles.bottomMeta}>
          <div className={styles.metaTitle}>Categories</div>
          {categories.length > 0 ? (
            <CategoryList categories={categories} />
          ) : (
            <div className={styles.metaEmpty}>No categories found.</div>
          )}
        </div>
      </main>

      <aside className={styles.sidebar}>
        <div className={styles.sideCard}>
          <div className={styles.sideHeader}>
            <div className={styles.sideTitle}>Related</div>
            <Link className={styles.sideLink} to={`/search?q=${encodeURIComponent(title)}`}>
              Search similar
            </Link>
          </div>

          {related.length === 0 ? (
            <div className={styles.metaEmpty}>No related articles available.</div>
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
