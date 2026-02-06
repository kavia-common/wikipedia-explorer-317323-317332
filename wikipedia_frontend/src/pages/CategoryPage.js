import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { getCategoryMembersPage, getCategorySubcategories } from "../api/wikipedia";
import ArticleCard from "../components/ArticleCard";
import CategoryList from "../components/CategoryList";
import EmptyState from "../components/EmptyState";
import ErrorState from "../components/ErrorState";
import LoadingState from "../components/LoadingState";
import styles from "./CategoryPage.module.css";

const PAGE_SIZE = 30;

// PUBLIC_INTERFACE
export default function CategoryPage() {
  /** Displays members of a given Wikipedia category. */
  const { t } = useTranslation();
  const { category: encodedCategory } = useParams();
  const location = useLocation();
  const category = useMemo(
    () => decodeURIComponent(encodedCategory || ""),
    [encodedCategory]
  );

  // Optional origin context (e.g., coming from an article).
  const origin = location.state?.fromArticle
    ? {
        title: String(location.state.fromArticle.title || ""),
      }
    : null;

  const [items, setItems] = useState([]);
  const [continueToken, setContinueToken] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | success | error
  const [error, setError] = useState("");

  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState("");

  // Subcategories (optional).
  const [subcats, setSubcats] = useState([]);
  const [subcatsStatus, setSubcatsStatus] = useState("idle"); // idle | loading | success | error

  const loadMoreButtonRef = useRef(null);

  // Restore scroll position if we navigated away and came back.
  useEffect(() => {
    const y = location.state?.restoreScrollY;
    if (typeof y === "number" && Number.isFinite(y) && y >= 0) {
      // Restore after paint.
      const id = window.setTimeout(() => {
        window.scrollTo({ top: y, behavior: "auto" });
      }, 0);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [location.state]);

  // Initial fetch (first page) for members + subcategories.
  useEffect(() => {
    if (!category) return;

    const controller = new AbortController();
    let active = true;

    setStatus("loading");
    setError("");
    setItems([]);
    setContinueToken(null);
    setLoadingMore(false);
    setLoadMoreError("");

    setSubcats([]);
    setSubcatsStatus("loading");

    (async () => {
      try {
        const res = await getCategoryMembersPage(
          category,
          { limit: PAGE_SIZE, continueToken: null },
          { signal: controller.signal, lang: i18n.language }
        );
        if (!active) return;

        setItems(res.items || []);
        setContinueToken(res.continueToken || null);
        setStatus("success");
      } catch (e) {
        if (!active) return;
        if (e?.name === "AbortError") return;
        setStatus("error");
        setError(e?.message || t("category.failedToLoadMembers"));
      }
    })();

    (async () => {
      try {
        const res = await getCategorySubcategories(
          category,
          { limit: 50, continueToken: null },
          { signal: controller.signal, lang: i18n.language }
        );
        if (!active) return;
        setSubcats(res.items || []);
        setSubcatsStatus("success");
      } catch (e) {
        if (!active) return;
        if (e?.name === "AbortError") return;
        // Graceful fallback: subcategories are optional, so don't block the page.
        setSubcats([]);
        setSubcatsStatus("error");
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [category]);

  const hasMore = Boolean(continueToken);
  const canLoadMore = status === "success" && hasMore && !loadingMore;

  const handleLoadMore = async () => {
    if (!category) return;
    if (!continueToken) return;

    const controller = new AbortController();
    setLoadingMore(true);
    setLoadMoreError("");

    try {
      const res = await getCategoryMembersPage(
        category,
        { limit: PAGE_SIZE, continueToken },
        { signal: controller.signal, lang: i18n.language }
      );

      setItems((prev) => [...prev, ...(res.items || [])]);
      setContinueToken(res.continueToken || null);
      setLoadingMore(false);

      // Maintain focus on the "Load more" control for keyboard/screen reader users.
      // If there are no more results, focus will remain; otherwise keep it stable.
      window.setTimeout(() => loadMoreButtonRef.current?.focus(), 0);
    } catch (e) {
      if (e?.name === "AbortError") return;
      setLoadingMore(false);
      setLoadMoreError(e?.message || t("category.failedToLoadMore"));
      window.setTimeout(() => loadMoreButtonRef.current?.focus(), 0);
    }
  };

  return (
    <div className={styles.wrap}>
      <nav className={styles.breadcrumbs} aria-label={t("common.breadcrumb")}>
        <Link className={styles.crumbLink} to="/">
          {t("category.breadcrumbs.home")}
        </Link>
        <span className={styles.crumbSep} aria-hidden="true">
          /
        </span>
        {origin?.title ? (
          <>
            <Link
              className={styles.crumbLink}
              to={`/article/${encodeURIComponent(origin.title)}`}
              state={{
                fromCategory: {
                  name: category,
                  path: location.pathname,
                  title: category,
                  restoreScrollY: typeof window !== "undefined" ? window.scrollY : 0,
                },
              }}
            >
              {origin.title}
            </Link>
            <span className={styles.crumbSep} aria-hidden="true">
              /
            </span>
          </>
        ) : null}
        <span className={styles.crumbCurrent}>{t("category.breadcrumbs.category")}</span>
      </nav>

      <div className={styles.header}>
        <h1 className={styles.title}>{t("category.titlePrefix", { category })}</h1>
        <div className={styles.subtitle}>{t("category.subtitle")}</div>
      </div>

      {subcatsStatus === "success" && subcats.length > 0 ? (
        <section className={styles.subcats} aria-label={t("category.subcategoriesAria")}>
          <div className={styles.sectionTitle}>{t("category.subcategories")}</div>
          <CategoryList categories={subcats} />
        </section>
      ) : null}

      {status === "loading" && (
        <LoadingState title={t("category.loadingTitle")} description={t("category.loadingDescription")} />
      )}
      {status === "error" && (
        <ErrorState
          title={t("category.unableToLoad")}
          description={error || t("errors.somethingWentWrong")}
          onRetry={() => setStatus("loading")}
          retryLabel={t("common.tryAgain")}
        />
      )}
      {status === "success" && items.length === 0 && (
        <EmptyState title={t("category.noPagesTitle")} description={t("category.noPagesDescription")} />
      )}

      <div className={styles.list} aria-live="polite">
        {items.map((it) => (
          <ArticleCard
            key={it.pageid || it.title}
            title={it.title}
            to={`/article/${encodeURIComponent(it.title)}`}
            linkState={{
              fromCategory: {
                name: category,
                title: category,
                path: location.pathname,
                restoreScrollY: typeof window !== "undefined" ? window.scrollY : 0,
              },
            }}
          />
        ))}
      </div>

      {status === "success" && items.length > 0 ? (
        <div className={styles.loadMoreRow}>
          {loadMoreError ? (
            <div className={styles.loadMoreError} role="alert">
              {loadMoreError}
            </div>
          ) : null}

          {hasMore ? (
            <button
              ref={loadMoreButtonRef}
              type="button"
              className={styles.loadMoreButton}
              onClick={handleLoadMore}
              disabled={!canLoadMore}
              aria-busy={loadingMore ? "true" : "false"}
            >
              {loadingMore ? t("category.loadingMore") : t("category.loadMore")}
            </button>
          ) : (
            <div className={styles.loadMoreDone} role="note">
              {t("category.endOfCategory")}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
