import React from "react";
import { act } from "react-dom/test-utils";
import { render, screen } from "@testing-library/react";
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

jest.mock("../../utils/sanitizeHtml", () => ({
  sanitizeWikipediaHtml: jest.fn((html) => html),
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderRoute(title) {
  return render(
    <MemoryRouter initialEntries={[`/article/${encodeURIComponent(title)}`]}>
      <Routes>
        <Route path="/article/:title" element={<ArticlePage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("ArticlePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getArticleCacheKeys.mockImplementation((t) => ({
      summary: `s:${t}`,
      html: `h:${t}`,
      related: `r:${t}`,
    }));
    subscribeWikipediaCache.mockImplementation(() => () => {});
    getWikipediaCacheStatus.mockReturnValue({ hit: false, stale: false });

    getArticleSummary.mockResolvedValue({ title: "T", description: "D", extract: "E" });
    getArticleHtml.mockResolvedValue("<p>hello</p>");
    getArticleCategories.mockResolvedValue(["C1"]);
    getArticleRelated.mockResolvedValue([{ title: "R1", extract: "", description: "", thumbnail: "" }]);
  });

  test("loading state renders LoadingState", () => {
    // Keep the summary promise pending so the component remains loading.
    const d = deferred();
    getArticleSummary.mockReturnValue(d.promise);
    renderRoute("React");

    expect(screen.getByRole("status")).toHaveTextContent(/loading article/i);
  });

  test("error state renders ErrorState on failure", async () => {
    getArticleSummary.mockRejectedValue(new Error("Nope"));
    renderRoute("BadTitle");

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to load/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/nope/i);
  });

  test("cached-first (SWR): uses cached values immediately and updates via subscriptions", async () => {
    // Pretend summary/html are cached but stale, so page renders immediately.
    getWikipediaCacheStatus.mockImplementation((key) => {
      if (String(key).startsWith("s:")) return { hit: true, stale: true, value: { title: "CachedTitle", description: "CachedDesc" } };
      if (String(key).startsWith("h:")) return { hit: true, stale: true, value: "<p>cached html</p>" };
      if (String(key).startsWith("r:")) return { hit: true, stale: true, value: [{ title: "CachedRelated" }] };
      return { hit: false, stale: false };
    });

    const subscribers = new Map();
    subscribeWikipediaCache.mockImplementation((key, cb) => {
      subscribers.set(key, cb);
      return () => subscribers.delete(key);
    });

    renderRoute("React");

    // Cached render
    expect(await screen.findByText("CachedTitle")).toBeInTheDocument();
    expect(screen.getByText(/updating/i)).toBeInTheDocument();

    // Simulate SWR refresh completing
    await act(async () => {
      subscribers.get("s:React")?.({ title: "FreshTitle", description: "FreshDesc" });
      subscribers.get("h:React")?.("<p>fresh html</p>");
      subscribers.get("r:React")?.([{ title: "FreshRelated" }]);
    });

    expect(await screen.findByText("FreshTitle")).toBeInTheDocument();
    expect(screen.getByText("FreshRelated")).toBeInTheDocument();
  });

  test("abort / navigating to another title: late updates from previous title must not update UI", async () => {
    jest.useFakeTimers();

    const d1 = deferred();
    const d2 = deferred();

    getArticleSummary
      .mockImplementationOnce(() => d1.promise) // title A
      .mockImplementationOnce(() => d2.promise); // title B

    render(
      <MemoryRouter initialEntries={["/article/A"]}>
        <Routes>
          <Route path="/article/:title" element={<ArticlePage />} />
        </Routes>
      </MemoryRouter>
    );

    render(
      <MemoryRouter initialEntries={["/article/B"]}>
        <Routes>
          <Route path="/article/:title" element={<ArticlePage />} />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => {
      d1.resolve({ title: "TITLE_A", description: "" });
      await d1.promise;
      jest.runOnlyPendingTimers();
    });

    expect(screen.queryByText("TITLE_A")).toBeNull();

    await act(async () => {
      d2.resolve({ title: "TITLE_B", description: "" });
      await d2.promise;
      jest.runOnlyPendingTimers();
    });

    expect(await screen.findByText("TITLE_B")).toBeInTheDocument();

    jest.useRealTimers();
  });
});
