import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getCategoryMembers } from "../api/wikipedia";
import ArticleCard from "../components/ArticleCard";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import styles from "./CategoryPage.module.css";

// PUBLIC_INTERFACE
export default function CategoryPage() {
  /** Displays members of a given Wikipedia category. */
  const { category: encodedCategory } = useParams();
  const category = useMemo(
    () => decodeURIComponent(encodedCategory || ""),
    [encodedCategory]
  );

  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!category) return;

    const controller = new AbortController();
    let active = true;

    setStatus("loading");
    setError("");
    setItems([]);

    (async () => {
      try {
        const res = await getCategoryMembers(category, 30, {
          signal: controller.signal,
        });
        if (!active) return;
        setItems(res);
        setStatus("success");
      } catch (e) {
        if (!active) return;
        if (e?.name === "AbortError") return;
        setStatus("error");
        setError(e?.message || "Failed to load category members.");
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [category]);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>Category: {category}</h1>
        <div className={styles.subtitle}>Browse pages in this category.</div>
      </div>

      {status === "loading" && (
        <LoadingState title="Loading category…" description="Fetching category members." />
      )}
      {status === "error" && (
        <ErrorState
          title="Unable to load category"
          description={error || "Something went wrong."}
          onRetry={() => setStatus("loading")}
          retryLabel="Try again"
        />
      )}
      {status === "success" && items.length === 0 && (
        <EmptyState
          title="No pages found"
          description="This category may be empty or unavailable."
        />
      )}

      <div className={styles.list}>
        {items.map((it) => (
          <ArticleCard
            key={it.pageid || it.title}
            title={it.title}
          />
        ))}
      </div>
    </div>
  );
}
