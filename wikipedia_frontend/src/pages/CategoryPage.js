import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { getCategoryMembers } from "../api/wikipedia";
import ArticleCard from "../components/ArticleCard";
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

    let active = true;
    setStatus("loading");
    setError("");
    setItems([]);

    (async () => {
      try {
        const res = await getCategoryMembers(category, 30);
        if (!active) return;
        setItems(res);
        setStatus("success");
      } catch (e) {
        if (!active) return;
        setStatus("error");
        setError(e?.message || "Failed to load category members.");
      }
    })();

    return () => {
      active = false;
    };
  }, [category]);

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h2 className={styles.title}>Category: {category}</h2>
        <div className={styles.subtitle}>Browse pages in this category.</div>
      </div>

      {status === "loading" && <div className={styles.state}>Loading…</div>}
      {status === "error" && (
        <div className={styles.stateError}>{error || "Something went wrong."}</div>
      )}
      {status === "success" && items.length === 0 && (
        <div className={styles.state}>No pages found in this category.</div>
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
