import React from "react";
import { act } from "react-dom/test-utils";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ArticlePage from "../ArticlePage";

jest.mock("../../api/wikipedia", () => ({
  getArticleCacheKeys: jest.fn(),
  getWikipediaCacheStatus: jest.fn(),
  subscribeWikipediaCache: jest.fn(),
  getArticleSummary: jest.fn(),
  getArticleHtml: jest.fn(),
  getArticleCategories: jest.fn(),
  getArticleRelated: jest.fn(),
}));

jest.mock("../../pwa/offlineRecents", () => ({
  addRecentArticleTitle: jest.fn(),
}));

const {
  getArticleCacheKeys,
  getWikipediaCacheStatus,
  subscribeWikipediaCache,
  getArticleSummary,
  getArticleHtml,
  getArticleCategories,
  getArticleRelated,
} = require("../../api/wikipedia");

function renderRoute(initialEntry) {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/article/:title" element={<ArticlePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ArticlePage Phase 10 (TOC / anchors / references)", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Default cache behavior: no cached values.
    getArticleCacheKeys.mockImplementation((t) => ({
      summary: `s:${t}`,
      html: `h:${t}`,
      related: `r:${t}`,
    }));
    getWikipediaCacheStatus.mockReturnValue({ hit: false, stale: false });
    subscribeWikipediaCache.mockImplementation(() => () => {});

    getArticleSummary.mockResolvedValue({ title: "T", description: "D", extract: "E" });
    getArticleCategories.mockResolvedValue([]);
    getArticleRelated.mockResolvedValue([]);

    // Provide HTML with headings + references + citations.
    getArticleHtml.mockResolvedValue(`
      <p>Intro with citation <sup><a href="#cite_note-1">[1]</a></sup></p>
      <h2>Section One</h2>
      <p>Body</p>
      <h3>Sub A</h3>
      <p>More</p>
      <h2>References</h2>
      <ol class="references">
        <li id="cite_note-1">Ref one</li>
      </ol>
    `);

    // JSDOM doesn't implement scrollIntoView meaningfully; mock it.
    Element.prototype.scrollIntoView = jest.fn();

    // JSDOM lacks requestAnimationFrame in some environments; provide a sync fallback.
    if (!global.requestAnimationFrame) {
      global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    }
  });

  test("generates a TOC from h2-h4 headings", async () => {
    renderRoute("/article/Test");

    // Wait for article title to render (loaded).
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("T");

    // Desktop TOC should exist with i18n title.
    expect(screen.getAllByText(/table of contents/i)[0]).toBeInTheDocument();

    // TOC items should include section headings (excluding References heading is still a heading, but we allow it; at least the two we inserted)
    expect(screen.getAllByRole("link", { name: /section one/i })[0]).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /sub a/i })[0]).toBeInTheDocument();
  });

  test("clicking a TOC item scrolls smoothly and updates URL hash without reload", async () => {
    // Capture replaceState calls
    const replaceSpy = jest.spyOn(window.history, "replaceState");

    renderRoute("/article/Test");
    await screen.findByRole("heading", { level: 1 });

    const sectionLink = screen.getAllByRole("link", { name: /section one/i })[0];

    await act(async () => {
      fireEvent.click(sectionLink);
    });

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalled();
    const lastArgs = replaceSpy.mock.calls[replaceSpy.mock.calls.length - 1];
    expect(String(lastArgs[2] || "")).toMatch(/^#.+/);

    replaceSpy.mockRestore();
  });

  test("navigating directly to /article/:title#hash auto-scrolls after content render", async () => {
    renderRoute("/article/Test#section-one");

    await screen.findByRole("heading", { level: 1 });

    // allow rAF callback to run
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  test("in-text citation hash link scrolls to references item and updates hash", async () => {
    const replaceSpy = jest.spyOn(window.history, "replaceState");

    renderRoute("/article/Test");
    await screen.findByRole("heading", { level: 1 });

    const cite = screen.getByRole("link", { name: "[1]" });
    await act(async () => {
      fireEvent.click(cite);
    });

    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
    expect(replaceSpy).toHaveBeenCalled();

    replaceSpy.mockRestore();
  });

  test("references section can be collapsed/expanded via accessible button", async () => {
    // Force mobile (collapsed by default)
    const mql = {
      matches: true,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    };
    jest.spyOn(window, "matchMedia").mockImplementation(() => mql);

    renderRoute("/article/Test");
    await screen.findByRole("heading", { level: 1 });

    const btn = screen.getByRole("button", { name: /references/i });
    expect(btn).toHaveAttribute("aria-expanded", "false");

    await act(async () => {
      fireEvent.click(btn);
    });
    expect(btn).toHaveAttribute("aria-expanded", "true");

    window.matchMedia.mockRestore();
  });
});
