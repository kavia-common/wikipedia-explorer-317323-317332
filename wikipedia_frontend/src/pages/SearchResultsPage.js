import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  getSearchCacheKey,
  getWikipediaCacheStatus,
  searchPages,
  subscribeWikipediaCache,
} from "../api/wikipedia";
import ArticleCard from "../components/ArticleCard";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import { addRecentSearchQuery } from "../pwa/offlineRecents";
import styles from "./SearchResultsPage.module.css";

function useQueryParam(name) {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search).get(name) || "", [search, name]);
}

// PUBLIC_INTERFACE
export default function SearchResultsPage() {
  /** Displays Wikipedia search results for q= query param. */
  const q = useQueryParam("q");
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | loading | success | error
  const [error, setError] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Track current query key to avoid late updates when navigating quickly.
  const activeKeyRef = useRef("");

  useEffect(() => {
    const trimmed = q.trim();
    if (!trimmed) {
      setItems([]);
      setStatus("idle");
      setError("");
      setIsRefreshing(false);
      activeKeyRef.current = "";
      return;
    }

    // Track last-viewed searches for offline support and SW resync.
    addRecentSearchQuery(trimmed, { max: 8 });

    const key = getSearchCacheKey(trimmed, 20);
    activeKeyRef.current = key;

    const controller = new AbortController();
    let active = true;

    // If we already have cached data (possibly stale), don't force a full-screen loading state.
    const cacheStatus = getWikipediaCacheStatus(key);
    const hasAnyCached = cacheStatus.hit && Array.isArray(cacheStatus.value);

    setError("");
    setIsRefreshing(cacheStatus.hit && cacheStatus.stale);

    if (!hasAnyCached) {
      setStatus("loading");
    } else {
      setItems(cacheStatus.value);
      setStatus("success");
    }

    // Subscribe for background refresh updates for this key (SWR).
    const unsubscribe = subscribeWikipediaCache(key, (value) => {
      if (!active) return;
      if (activeKeyRef.current !== key) return;
      if (controller.signal.aborted) return;
      if (!Array.isArray(value)) return;

      setItems(value);
      setStatus("success");
      setIsRefreshing(false);
    });

    (async () => {
      try {
        const res = await searchPages(trimmed, 20, {
          signal: controller.signal,
          // Persistence on by default in API; pass explicitly for clarity.
          persist: true,
          onUpdate: (value, meta) => {
            // Guard against abort/unmount before updating state.
            if (!active) return;
            if (activeKeyRef.current !== key) return;
            if (controller.signal.aborted) return;
            if (!Array.isArray(value)) return;

            setItems(value);
            setStatus("success");
            setIsRefreshing(meta.stale);
          },
        });

        if (!active) return;
        if (controller.signal.aborted) return;
        if (activeKeyRef.current !== key) return;

        setItems(res);
        setStatus("success");
        setIsRefreshing(false);
      } catch (e) {
        if (!active) return;
        if (e?.name === "AbortError") return;

        setStatus("error");
        setIsRefreshing(false);
        setError(e?.message || "Failed to load search results.");
      }
    })();

    return () => {
      active = false;
      controller.abort();
      unsubscribe?.();
    };
  }, [q]);

  if (!q.trim()) {
    return (
      <EmptyState
        title="Search Wikipedia"
        description="Enter a query in the search bar to get results."
      />
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.headerRow}>
        <h1 className={styles.title}>Results for “{q}”</h1>
        <div className={styles.count}>
          {status === "success" ? `${items.length} results` : null}
          {typeof navigator !== "undefined" && navigator.onLine === false
            ? " • Offline (cached)"
            : null}
          {status === "success" && isRefreshing ? " • Updating…" : null}
        </div>
      </div>

      {status === "loading" && <LoadingState title="Loading results…" />}
      {status === "error" && (
        <ErrorState
          title="Unable to load results"
          description={error || "Something went wrong."}
          onRetry={() => {
            // By passing forceRefresh, we guarantee a network attempt; SWR still de-dupes.
            // (Simplest "retry": push state through a re-render by setting status)
            setStatus("loading");
          }}
          retryLabel="Try again"
        />
      )}
      {status === "success" && items.length === 0 && (
        <EmptyState title="No results" description="Try a different search term." />
      )}

      <div className={styles.list}>
        {items.map((it) => (
          <ArticleCard
            key={it.pageid || it.title}
            title={it.title}
            extract={it.extract}
            description={it.description}
            thumbnail={it.thumbnail}
          />
        ))}
      </div>
    </div>
  );
}
