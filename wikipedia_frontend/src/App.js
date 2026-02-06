import React, { useMemo } from "react";
import { Link, Route, Routes, useNavigate, useSearchParams } from "react-router-dom";
import "./App.css";
import SearchBar from "./components/SearchBar";
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
      <header className="TopNav">
        <div className="TopNavInner">
          <Link to="/" className="Brand" aria-label="Wikipedia Explorer Home">
            <div className="BrandMark">W</div>
            <div className="BrandText">
              <div className="BrandTitle">Wikipedia Explorer</div>
              <div className="BrandSubtitle">Search • Read • Browse categories</div>
            </div>
          </Link>

          <div className="NavSpacer" />

          <SearchBar
            initialQuery={q}
            onSubmit={(query) => navigate(`/search?q=${encodeURIComponent(query)}`)}
          />
        </div>
      </header>

      <main className="Main">
        <div className="MainInner">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/search" element={<SearchResultsPage />} />
            <Route path="/article/:title" element={<ArticlePage />} />
            <Route path="/category/:category" element={<CategoryPage />} />
          </Routes>
        </div>
      </main>

      <footer className="Footer">
        <div className="FooterInner">
          <div>
            Data from <span className="Badge">Wikipedia</span> • Base: {wikiBase}
          </div>
          <div>
            Tip: Click categories below an article to explore more pages.
          </div>
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
