import React, { useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { searchPages } from "../api/wikipedia";
import ArticleCard from "../components/ArticleCard";
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

    let active = true;
    setStatus("loading");
    setError("");

    (async () => {
      try {
        const res = await searchPages(q.trim(), 20);
        if (!active) return;
        setItems(res);
        setStatus("success");
      } catch (e) {
        if (!active) return;
        setStatus("error");
        setError(e?.message || "Failed to load search results.");
      }
    })();

    return () => {
      active = false;
    };
  }, [q]);

  if (!q.trim()) {
    return (
      <div className={styles.empty}>
        Enter a query in the search bar to get results.
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.headerRow}>
        <h2 className={styles.title}>Results for “{q}”</h2>
        <div className={styles.count}>
          {status === "success" ? `${items.length} results` : null}
        </div>
      </div>

      {status === "loading" && <div className={styles.state}>Loading…</div>}
      {status === "error" && (
        <div className={styles.stateError}>
          {error || "Something went wrong."}
        </div>
      )}
      {status === "success" && items.length === 0 && (
        <div className={styles.state}>No results found.</div>
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
