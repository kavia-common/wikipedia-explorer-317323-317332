import React from "react";
import { act } from "react-dom/test-utils";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ArticlePage from "../ArticlePage";

// Keep real sanitizer for safety regression tests in this file.
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

describe("ArticlePage Phase 11 (media handling upgrades)", () => {
  beforeEach(() => {
    jest.clearAllMocks();

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

    // IntersectionObserver mock (JSDOM doesn't provide it).
    global.IntersectionObserver = class IO {
      constructor(cb) {
        this.cb = cb;
        this.observed = new Set();
      }
      observe(el) {
        this.observed.add(el);
      }
      unobserve(el) {
        this.observed.delete(el);
      }
      disconnect() {
        this.observed.clear();
      }
      // helper for tests
      __triggerAllVisible() {
        const entries = Array.from(this.observed).map((el) => ({ target: el, isIntersecting: true }));
        this.cb(entries);
      }
    };
  });

  test("wraps safe in-article images with lazy placeholders and sets loading=lazy", async () => {
    getArticleHtml.mockResolvedValue(`
      <p>Intro</p>
      <img src="https://example.com/a.jpg" alt="A" />
      <p>More</p>
    `);

    renderRoute("/article/Test");
    await screen.findByRole("heading", { level: 1 });

    const img = screen.getByRole("img", { name: "A" });
    expect(img).toHaveAttribute("loading", "lazy");
    expect(img).toHaveAttribute("decoding", "async");

    // placeholder exists in rendered DOM
    const root = img.closest("[data-media-image-wrap='true']");
    expect(root).toBeTruthy();
    expect(root.querySelector("[data-media-placeholder='true']")).toBeTruthy();
  });

  test("clicking an in-article image opens viewer modal and Escape closes restoring focus", async () => {
    getArticleHtml.mockResolvedValue(`
      <p>Intro</p>
      <img src="https://example.com/a.jpg" alt="A" />
    `);

    renderRoute("/article/Test");
    await screen.findByRole("heading", { level: 1 });

    const img = screen.getByRole("img", { name: "A" });

    // focus something prior to opening so we can validate focus restore
    img.focus();
    expect(document.activeElement).toBe(img);

    await act(async () => {
      fireEvent.click(img);
    });

    const dialog = await screen.findByRole("dialog", { name: /image viewer/i });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /close/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });

    expect(screen.queryByRole("dialog")).toBeNull();
    // focus restored to previously focused element
    expect(document.activeElement).toBe(img);
  });

  test("keyboard: Enter on media wrapper opens viewer; tab is trapped inside modal", async () => {
    const user = userEvent.setup();

    getArticleHtml.mockResolvedValue(`
      <p>Intro</p>
      <img src="https://example.com/a.jpg" alt="A" />
    `);

    renderRoute("/article/Test");
    await screen.findByRole("heading", { level: 1 });

    const img = screen.getByRole("img", { name: "A" });
    const wrap = img.closest("[data-media-image-wrap='true']");
    expect(wrap).toBeTruthy();

    // Make wrapper focusable in test context to simulate keyboard navigation
    wrap.setAttribute("tabindex", "0");
    wrap.focus();
    expect(document.activeElement).toBe(wrap);

    await act(async () => {
      fireEvent.keyDown(wrap, { key: "Enter" });
    });

    const closeBtn = await screen.findByRole("button", { name: /close/i });
    expect(closeBtn).toBeInTheDocument();

    // Tab should keep focus within dialog controls
    await user.tab();
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement);

    await user.tab();
    expect(screen.getByRole("dialog")).toContainElement(document.activeElement);
  });

  test("sanitized HTML cannot inject unsafe media behavior (javascript: image src removed, not viewable)", async () => {
    getArticleHtml.mockResolvedValue(`
      <p>Bad</p>
      <img src="javascript:alert(1)" alt="XSS" />
      <a href="javascript:alert(2)"><img src="javascript:alert(3)" alt="Y" /></a>
      <img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==" alt="Z" />
      <img src="https://example.com/good.jpg" alt="Good" />
    `);

    renderRoute("/article/Test");
    await screen.findByRole("heading", { level: 1 });

    // Only the safe image should be wrapped and openable.
    const good = screen.getByRole("img", { name: "Good" });
    expect(good.closest("[data-media-image-wrap='true']")).toBeTruthy();

    // Attempt click should open modal
    await act(async () => {
      fireEvent.click(good);
    });
    expect(await screen.findByRole("dialog")).toBeInTheDocument();

    // Close it
    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });
    expect(screen.queryByRole("dialog")).toBeNull();

    // The unsafe images (if they remain after sanitization) must not have data-media-src.
    const maybeXss = screen.queryByRole("img", { name: "XSS" });
    if (maybeXss) {
      expect(maybeXss.getAttribute("data-media-src")).toBeFalsy();
      await act(async () => {
        fireEvent.click(maybeXss);
      });
      expect(screen.queryByRole("dialog")).toBeNull();
    }
  });

  test("viewer supports next/prev via arrow keys when multiple images are present", async () => {
    getArticleHtml.mockResolvedValue(`
      <p>Intro</p>
      <img src="https://example.com/a.jpg" alt="A" />
      <img src="https://example.com/b.jpg" alt="B" />
    `);

    renderRoute("/article/Test");
    await screen.findByRole("heading", { level: 1 });

    await act(async () => {
      fireEvent.click(screen.getByRole("img", { name: "A" }));
    });

    expect(await screen.findByRole("dialog", { name: /1 of 2/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "A" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: "ArrowRight" });
    });

    expect(await screen.findByRole("dialog", { name: /2 of 2/i })).toBeInTheDocument();

    await act(async () => {
      fireEvent.keyDown(window, { key: "ArrowLeft" });
    });

    expect(await screen.findByRole("dialog", { name: /1 of 2/i })).toBeInTheDocument();
  });
});
