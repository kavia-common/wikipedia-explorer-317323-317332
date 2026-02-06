import React, { useMemo } from "react";
import { Link, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import "./App.css";
import SearchBar from "./components/SearchBar";
import OfflineBanner from "./components/OfflineBanner";
import HomePage from "./pages/HomePage";
import SearchResultsPage from "./pages/SearchResultsPage";
import ArticlePage from "./pages/ArticlePage";
import CategoryPage from "./pages/CategoryPage";
import { getWikipediaBaseUrl } from "./api/wikipedia";

function AppShell() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const q = params.get("q") || "";

  const wikiBase = useMemo(() => getWikipediaBaseUrl(), []);

  return (
    <div className="AppShell">
      <OfflineBanner />
      {/* Keyboard skip links (visible on focus) */}
      <a className="SkipLink" href="#main-content">
        Skip to content
      </a>
      <a className="SkipLink SkipLinkSecondary" href="#site-search">
        Skip to search
      </a>

      <header className="TopNav" role="banner">
        <div className="TopNavInner">
          <Link to="/" className="Brand" aria-label="Wikipedia Explorer Home">
            <div className="BrandMark" aria-hidden="true">
              W
            </div>
            <div className="BrandText">
              <div className="BrandTitle">Wikipedia Explorer</div>
              <div className="BrandSubtitle">Search • Read • Browse categories</div>
            </div>
          </Link>

          <div className="NavSpacer" />

          <nav className="TopNavActions" aria-label="Site search">
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
            Data from <span className="Badge">Wikipedia</span> • Base: {wikiBase}
          </div>
          <div>Tip: Click categories below an article to explore more pages.</div>
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
