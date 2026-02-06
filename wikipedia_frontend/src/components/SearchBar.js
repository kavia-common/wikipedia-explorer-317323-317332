import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSearchSuggestions } from "../api/wikipedia";
import styles from "./SearchBar.module.css";

const RECENT_SEARCHES_KEY = "wiki_recent_searches_v1";
const MAX_RECENTS = 8;
const DEBOUNCE_MS = 300;

/**
 * Safely detect online/offline state.
 * navigator.onLine is not perfect, but is a good hint for fallback behavior.
 */
function isOnline() {
  return typeof navigator !== "undefined" ? navigator.onLine !== false : true;
}

function loadRecentSearches() {
  try {
    const raw = localStorage.getItem(RECENT_SEARCHES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveRecentSearches(list) {
  try {
    localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(list));
  } catch {
    // ignore quota/privacy errors
  }
}

function addRecentSearch(query) {
  const q = String(query || "").trim();
  if (!q) return;
  const current = loadRecentSearches();
  const next = [q, ...current.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(
    0,
    MAX_RECENTS
  );
  saveRecentSearches(next);
}

// PUBLIC_INTERFACE
export default function SearchBar({ initialQuery = "", onSubmit, inputId }) {
  /** Search bar with suggestions; calls onSubmit(query) when submitted. */
  const [value, setValue] = useState(initialQuery);

  // The list currently shown in the listbox (API suggestions or recent searches fallback).
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Active option index in the listbox for keyboard navigation. -1 means "none".
  const [activeIndex, setActiveIndex] = useState(-1);

  const abortRef = useRef(null);
  const listboxId = useMemo(
    () => `search-suggestions-${Math.random().toString(16).slice(2)}`,
    []
  );

  useEffect(() => setValue(initialQuery), [initialQuery]);

  const canSuggest = useMemo(() => value.trim().length >= 2, [value]);

  // Close suggestions when clicking outside the component.
  const rootRef = useRef(null);
  useEffect(() => {
    function onDocMouseDown(e) {
      if (!rootRef.current) return;
      if (rootRef.current.contains(e.target)) return;
      setOpen(false);
      setActiveIndex(-1);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  // Keep a live cache of recent searches while the component is mounted.
  const [recentSearches, setRecentSearches] = useState(() => loadRecentSearches());

  // Refresh recent searches when coming back online/offline (or another tab updates storage).
  useEffect(() => {
    function onStorage(e) {
      if (e.key === RECENT_SEARCHES_KEY) setRecentSearches(loadRecentSearches());
    }
    function onOnlineOffline() {
      setRecentSearches(loadRecentSearches());
    }
    window.addEventListener("storage", onStorage);
    window.addEventListener("online", onOnlineOffline);
    window.addEventListener("offline", onOnlineOffline);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("online", onOnlineOffline);
      window.removeEventListener("offline", onOnlineOffline);
    };
  }, []);

  /**
   * Fetch suggestions with debounce and AbortController.
   * Important: do not update state with stale results after abort / dependency changes.
   */
  useEffect(() => {
    // Reset list when the input is too short.
    if (!canSuggest) {
      // If we're offline, we still may show recent searches as a helpful fallback.
      if (!isOnline() && recentSearches.length > 0 && open) {
        setItems(recentSearches.slice(0, MAX_RECENTS));
      } else {
        setItems([]);
      }
      setLoading(false);
      setActiveIndex(-1);
      return;
    }

    // Debounce typing.
    let active = true;
    const q = value.trim();

    setLoading(true);

    const timer = window.setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;

      (async () => {
        try {
          const list = await getSearchSuggestions(q, 8, {
            signal: controller.signal,
          });
          if (!active) return;
          setItems(list);
          setActiveIndex(-1);
        } catch (e) {
          if (!active) return;
          if (e?.name === "AbortError") return;

          // If offline (or likely offline), show recent searches instead of nothing.
          if (!isOnline() && recentSearches.length > 0) {
            setItems(recentSearches.slice(0, MAX_RECENTS));
          } else {
            setItems([]);
          }
          setActiveIndex(-1);
        } finally {
          if (active) setLoading(false);
        }
      })();
    }, DEBOUNCE_MS);

    return () => {
      active = false;
      window.clearTimeout(timer);

      // Abort any in-flight request for the previous value.
      if (abortRef.current) abortRef.current.abort();
    };
  }, [value, canSuggest, recentSearches, open]);

  const handleSubmit = (q) => {
    const query = (q ?? value).trim();
    if (!query) return;

    // Save query for offline fallback.
    addRecentSearch(query);
    setRecentSearches(loadRecentSearches());

    setOpen(false);
    setActiveIndex(-1);
    onSubmit?.(query);
  };

  const showListbox = open && (items.length > 0 || loading);

  const activeDescendantId =
    showListbox && activeIndex >= 0 && activeIndex < items.length
      ? `${listboxId}-opt-${activeIndex}`
      : undefined;

  return (
    <div className={styles.wrapper} ref={rootRef}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          // If an option is active, submit that; otherwise submit current value.
          if (activeIndex >= 0 && activeIndex < items.length) {
            handleSubmit(items[activeIndex]);
          } else {
            handleSubmit();
          }
        }}
        role="search"
      >
        <input
          id={inputId}
          className={styles.input}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            // If offline and input is short, show recents immediately.
            if (!isOnline() && value.trim().length < 2 && recentSearches.length > 0) {
              setItems(recentSearches.slice(0, MAX_RECENTS));
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setOpen(false);
              setActiveIndex(-1);
              return;
            }

            if (!showListbox) return;

            if (e.key === "ArrowDown") {
              e.preventDefault();
              const next = Math.min(activeIndex + 1, items.length - 1);
              setActiveIndex(next);
              return;
            }

            if (e.key === "ArrowUp") {
              e.preventDefault();
              const next = Math.max(activeIndex - 1, 0);
              setActiveIndex(next);
              return;
            }

            if (e.key === "Enter") {
              if (activeIndex >= 0 && activeIndex < items.length) {
                e.preventDefault();
                handleSubmit(items[activeIndex]);
              }
            }
          }}
          placeholder="Search Wikipedia…"
          aria-label="Search Wikipedia"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showListbox}
          aria-controls={showListbox ? listboxId : undefined}
          aria-activedescendant={activeDescendantId}
        />
        <button className={styles.button} type="submit">
          Search
        </button>
      </form>

      {showListbox && (
        <div
          className={styles.suggestions}
          role="listbox"
          id={listboxId}
          aria-label="Suggestions"
        >
          {loading && <div className={styles.suggestionHint}>Loading…</div>}

          {!loading && !isOnline() && recentSearches.length > 0 ? (
            <div className={styles.sectionHint} aria-hidden="true">
              Recent searches (offline)
            </div>
          ) : null}

          {items.map((s, idx) => (
            <button
              key={`${s}-${idx}`}
              id={`${listboxId}-opt-${idx}`}
              type="button"
              role="option"
              aria-selected={idx === activeIndex}
              className={`${styles.suggestion} ${
                idx === activeIndex ? styles.suggestionActive : ""
              }`}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setActiveIndex(idx)}
              onClick={() => handleSubmit(s)}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
