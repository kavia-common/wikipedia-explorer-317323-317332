import React, { createContext, useCallback, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "wikiExplorer.theme";

/**
 * Theme names supported by the application.
 * @typedef {"light" | "dark"} ThemeName
 */

/**
 * @typedef ThemeContextValue
 * @property {ThemeName} theme
 * @property {() => void} toggleTheme
 * @property {(theme: ThemeName) => void} setTheme
 * @property {() => void} clearUserPreference - Clears localStorage override and re-syncs to system.
 */

/**
 * @type {React.Context<ThemeContextValue | null>}
 */
const ThemeContext = createContext(null);

function safeGetLocalStorage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSystemTheme() {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getInitialTheme() {
  const ls = typeof window !== "undefined" ? safeGetLocalStorage() : null;
  const stored = ls?.getItem(STORAGE_KEY);
  if (stored === "light" || stored === "dark") return stored;
  return getSystemTheme();
}

function applyThemeToRoot(theme) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
}

// PUBLIC_INTERFACE
export function useTheme() {
  /** Hook to access ThemeContext values. */
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within ThemeProvider");
  }
  return ctx;
}

// PUBLIC_INTERFACE
export default function ThemeProvider({ children }) {
  /** Provides theme state, syncing to localStorage + system preference and applying data-theme attribute. */
  const [theme, setThemeState] = useState(getInitialTheme);

  const setTheme = useCallback((nextTheme) => {
    setThemeState(nextTheme);
    applyThemeToRoot(nextTheme);

    const ls = safeGetLocalStorage();
    // Persist explicit user choice.
    ls?.setItem(STORAGE_KEY, nextTheme);
  }, []);

  const clearUserPreference = useCallback(() => {
    const ls = safeGetLocalStorage();
    ls?.removeItem(STORAGE_KEY);

    const systemTheme = getSystemTheme();
    setThemeState(systemTheme);
    applyThemeToRoot(systemTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, [setTheme]);

  // Apply on mount in case initial state came from system or storage.
  useEffect(() => {
    applyThemeToRoot(theme);
  }, [theme]);

  // If there is no user preference, keep theme in sync with system changes.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;

    const ls = safeGetLocalStorage();
    const hasUserPref = () => {
      const v = ls?.getItem(STORAGE_KEY);
      return v === "light" || v === "dark";
    };

    const mq = window.matchMedia("(prefers-color-scheme: dark)");

    const onChange = () => {
      if (hasUserPref()) return; // explicit preference wins
      const systemTheme = mq.matches ? "dark" : "light";
      setThemeState(systemTheme);
      applyThemeToRoot(systemTheme);
    };

    // Safari < 14 uses addListener/removeListener.
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }

    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  const value = useMemo(
    () => ({ theme, setTheme, toggleTheme, clearUserPreference }),
    [theme, setTheme, toggleTheme, clearUserPreference]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}
