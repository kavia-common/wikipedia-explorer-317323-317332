import React from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { setWikipediaLanguage } from "../api/wikipedia";

// PUBLIC_INTERFACE
export default function LanguageSelector() {
  /** Top-nav language selector that updates i18n + API language and persists via i18n handler. */
  const { t } = useTranslation();

  const current = i18n.language || "en";

  return (
    <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className="srOnly">{t("nav.language")}</span>
      <select
        aria-label={t("nav.language")}
        value={current}
        onChange={(e) => {
          const lang = e.target.value;
          void i18n.changeLanguage(lang);
          setWikipediaLanguage(lang);
        }}
        style={{
          height: 36,
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "white",
          padding: "0 10px",
          fontWeight: 700,
          color: "rgba(17, 24, 39, 0.9)",
        }}
      >
        <option value="en">{t("language.english")}</option>
        <option value="es">{t("language.spanish")}</option>
      </select>
    </label>
  );
}
