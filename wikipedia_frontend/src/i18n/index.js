import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import es from "./locales/es.json";

const LS_LANG_KEY = "wiki_ui_lang_v1";

/**
 * Normalize a language tag (e.g., "en-US" -> "en").
 */
function normalizeLanguage(tag) {
  const raw = String(tag || "").trim().toLowerCase();
  if (!raw) return "en";
  const base = raw.split("-")[0];
  return base || "en";
}

function getBrowserLanguage() {
  if (typeof navigator === "undefined") return "en";
  const lang =
    navigator.languages?.[0] ||
    navigator.language ||
    navigator.userLanguage ||
    "en";
  return normalizeLanguage(lang);
}

// PUBLIC_INTERFACE
export function getInitialLanguage() {
  /** Determine initial UI language: localStorage -> browser -> en. */
  try {
    const stored = localStorage.getItem(LS_LANG_KEY);
    if (stored) return normalizeLanguage(stored);
  } catch {
    // ignore
  }
  return getBrowserLanguage() || "en";
}

// PUBLIC_INTERFACE
export function setPersistedLanguage(lang) {
  /** Persist selected language best-effort. */
  try {
    localStorage.setItem(LS_LANG_KEY, normalizeLanguage(lang));
  } catch {
    // ignore
  }
}

// PUBLIC_INTERFACE
export function getPersistedLanguage() {
  /** Read persisted language (normalized) or null if missing. */
  try {
    const stored = localStorage.getItem(LS_LANG_KEY);
    return stored ? normalizeLanguage(stored) : null;
  } catch {
    return null;
  }
}

/**
 * i18n bootstrap.
 * - fallbackLng ensures missing keys show English strings.
 * - returnEmptyString=false avoids blank UI if a translation string is accidentally "".
 */
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    es: { translation: es },
  },
  lng: getInitialLanguage(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
  returnEmptyString: false,
  returnNull: false,
});

i18n.on("languageChanged", (lng) => {
  setPersistedLanguage(lng);
});

export default i18n;
export { LS_LANG_KEY, normalizeLanguage };
