import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getArticleCategories,
  getArticleHtml,
  getArticleRelated,
  getArticleSummary,
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
  const title = useMemo(
    () => decodeURIComponent(encodedTitle || ""),
    [encodedTitle]
  );

  const [summary, setSummary] = useState(null);
  const [html, setHtml] = useState("");
  const [categories, setCategories] = useState([]);
  const [related, setRelated] = useState([]);

  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!title) return;

    const controller = new AbortController();
    let active = true;

    setStatus("loading");
    setError("");
    setSummary(null);
    setHtml("");
    setCategories([]);
    setRelated([]);

    (async () => {
      try {
        const [s, h, c, r] = await Promise.all([
          getArticleSummary(title, { signal: controller.signal }),
          getArticleHtml(title, { signal: controller.signal }),
          getArticleCategories(title, 25, { signal: controller.signal }),
          getArticleRelated(title, { signal: controller.signal }),
        ]);
        if (!active) return;

        setSummary(s);
        setHtml(h);
        setCategories(c);
        setRelated(r.slice(0, 8));
        setStatus("success");
      } catch (e) {
        if (!active) return;
        if (e?.name === "AbortError") return;
        setStatus("error");
        setError(e?.message || "Failed to load article.");
      }
    })();

    return () => {
      active = false;
      controller.abort();
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

  const leadImage =
    summary?.thumbnail?.source ||
    summary?.originalimage?.source ||
    "";

  const safeHtml = sanitizeWikipediaHtml(html);

  return (
    <div className={styles.layout}>
      <main className={styles.main}>
        <div className={styles.top}>
          <h1 className={styles.title}>{summary?.title || title}</h1>
          {summary?.description ? (
            <div className={styles.description}>{summary.description}</div>
          ) : null}
        </div>

        {leadImage ? (
          <img className={styles.leadImage} src={leadImage} alt="" />
        ) : null}

        {summary?.extract ? (
          <div className={styles.extract}>{summary.extract}</div>
        ) : null}

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
