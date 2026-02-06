import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { searchPages } from "../api/wikipedia";
import ArticleCard from "../components/ArticleCard";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
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

  useEffect(() => {
    if (!q.trim()) {
      setItems([]);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    let active = true;

    setStatus("loading");
    setError("");

    (async () => {
      try {
        const res = await searchPages(q.trim(), 20, { signal: controller.signal });
        if (!active) return;
        setItems(res);
        setStatus("success");
      } catch (e) {
        if (!active) return;
        if (e?.name === "AbortError") return;
        setStatus("error");
        setError(e?.message || "Failed to load search results.");
      }
    })();

    return () => {
      active = false;
      controller.abort();
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
        </div>
      </div>

      {status === "loading" && <LoadingState title="Loading results…" />}
      {status === "error" && (
        <ErrorState
          title="Unable to load results"
          description={error || "Something went wrong."}
          onRetry={() => {
            // Trigger effect by setting status; q is stable, so just re-run by forcing state update.
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
