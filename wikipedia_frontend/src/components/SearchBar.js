import React, { useEffect, useMemo, useRef, useState } from "react";
import { getSearchSuggestions } from "../api/wikipedia";
import styles from "./SearchBar.module.css";

// PUBLIC_INTERFACE
export default function SearchBar({ initialQuery = "", onSubmit }) {
  /** Search bar with suggestions; calls onSubmit(query) when submitted. */
  const [value, setValue] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => setValue(initialQuery), [initialQuery]);

  const canSuggest = useMemo(() => value.trim().length >= 2, [value]);

  useEffect(() => {
    if (!canSuggest) {
      setSuggestions([]);
      return;
    }

    let active = true;
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    (async () => {
      try {
        const list = await getSearchSuggestions(value.trim(), 8, {
          signal: controller.signal,
        });
        if (!active) return;
        setSuggestions(list);
      } catch (e) {
        // AbortError is expected during fast typing / navigation.
        if (!active) return;
        if (e?.name === "AbortError") return;
        setSuggestions([]);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
      controller.abort();
    };
  }, [value, canSuggest]);

  const handleSubmit = (q) => {
    const query = (q ?? value).trim();
    if (!query) return;
    setOpen(false);
    onSubmit?.(query);
  };

  return (
    <div className={styles.wrapper}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          handleSubmit();
        }}
        role="search"
      >
        <input
          className={styles.input}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search Wikipedia…"
          aria-label="Search Wikipedia"
        />
        <button className={styles.button} type="submit">
          Search
        </button>
      </form>

      {open && (suggestions.length > 0 || loading) && (
        <div className={styles.suggestions} role="listbox" aria-label="Suggestions">
          {loading && <div className={styles.suggestionHint}>Loading…</div>}
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              className={styles.suggestion}
              onMouseDown={(e) => e.preventDefault()}
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
