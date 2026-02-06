import React, { useEffect, useMemo } from "react";
import { Link, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./App.css";
import SearchBar from "./components/SearchBar";
import OfflineBanner from "./components/OfflineBanner";
import LanguageSelector from "./components/LanguageSelector";
import HomePage from "./pages/HomePage";
import SearchResultsPage from "./pages/SearchResultsPage";
import ArticlePage from "./pages/ArticlePage";
import CategoryPage from "./pages/CategoryPage";
import { getWikipediaBaseUrl, setWikipediaLanguage } from "./api/wikipedia";
import i18n from "./i18n";

function AppShell() {
  const { t } = useTranslation();

  const navigate = useNavigate();
  const [params] = useSearchParams();
  const q = params.get("q") || "";

  // Keep API language aligned with i18n language (on mount + when switching).
  useEffect(() => {
    setWikipediaLanguage(i18n.language);
  }, []);

  const wikiBase = useMemo(() => getWikipediaBaseUrl(i18n.language), [i18n.language]);

  return (
    <div className="AppShell">
      <OfflineBanner />
      {/* Keyboard skip links (visible on focus) */}
      <a className="SkipLink" href="#main-content">
        {t("nav.skipToContent")}
      </a>
      <a className="SkipLink SkipLinkSecondary" href="#site-search">
        {t("nav.skipToSearch")}
      </a>

      <header className="TopNav" role="banner">
        <div className="TopNavInner">
          <Link to="/" className="Brand" aria-label={t("nav.homeAria")}>
            <div className="BrandMark" aria-hidden="true">
              W
            </div>
            <div className="BrandText">
              <div className="BrandTitle">{t("app.name")}</div>
              <div className="BrandSubtitle">{t("app.tagline")}</div>
            </div>
          </Link>

          <div className="NavSpacer" />

          <nav className="TopNavActions" aria-label={t("nav.siteSearchAria")}>
            <LanguageSelector />
            <SearchBar
              inputId="site-search"
              initialQuery={q}
              onSubmit={(query) => navigate(`/search?q=${encodeURIComponent(query)}`)}
            />
          </nav>
        </div>
      </header>

      <main className="Main" id="main-content" role="main" tabIndex={-1}>
        <div className="MainInner">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchResultsPage />} />
            <Route path="/article/:title" element={<ArticlePage />} />
            <Route path="/category/:category" element={<CategoryPage />} />
          </Routes>
        </div>
      </main>

      <footer className="Footer" role="contentinfo">
        <div className="FooterInner">
          <div>
            {t("app.dataFrom")} <span className="Badge">Wikipedia</span> • {t("app.base")}:{" "}
            {wikiBase}
          </div>
          <div>{t("app.tipFooter")}</div>
        </div>
      </footer>
    </div>
  );
}

// PUBLIC_INTERFACE
export default function App() {
  /** Main App entry (routes defined in AppShell). */
  return <AppShell />;
}
