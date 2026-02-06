import React from "react";
import { act } from "react-dom/test-utils";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import SearchResultsPage from "../SearchResultsPage";

jest.mock("../../api/wikipedia", () => ({
  getSearchCacheKey: jest.fn(),
  getWikipediaCacheStatus: jest.fn(),
  searchPages: jest.fn(),
  subscribeWikipediaCache: jest.fn(),
}));

const {
  getSearchCacheKey,
  getWikipediaCacheStatus,
  searchPages,
  subscribeWikipediaCache,
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

function renderAt(url) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/search" element={<SearchResultsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("SearchResultsPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getSearchCacheKey.mockImplementation((q, limit) => `k:${q}:${limit}`);
    // Default: no cache hit
    getWikipediaCacheStatus.mockReturnValue({ hit: false, stale: false });
    subscribeWikipediaCache.mockImplementation(() => () => {});
  });

  test("empty query renders shared EmptyState", () => {
    renderAt("/search?q=");

    expect(screen.getByRole("note")).toHaveTextContent(/search wikipedia/i);
    expect(screen.queryByRole("status")).toBeNull();
    expect(searchPages).not.toHaveBeenCalled();
  });

  test("loading state renders LoadingState when no cached data", async () => {
    const d = deferred();
    searchPages.mockReturnValue(d.promise);

    renderAt("/search?q=react");

    expect(screen.getByRole("status")).toHaveTextContent(/loading results/i);

    // Resolve network
    await act(async () => {
      d.resolve([{ pageid: 1, title: "React", extract: "", description: "", thumbnail: "" }]);
      await d.promise;
    });

    expect(await screen.findByText("React")).toBeInTheDocument();
  });

  test("error state renders ErrorState when request fails", async () => {
    searchPages.mockRejectedValue(new Error("Boom"));

    renderAt("/search?q=oops");

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to load results/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/boom/i);
  });

  test("success with empty results renders shared EmptyState", async () => {
    searchPages.mockResolvedValue([]);

    renderAt("/search?q=unlikely");

    expect(await screen.findByRole("note")).toHaveTextContent(/no results/i);
  });

  test("cached-first (SWR): renders cached data immediately and then updates from subscribe callback", async () => {
    const key = "k:react:20";
    getSearchCacheKey.mockReturnValue(key);

    getWikipediaCacheStatus.mockReturnValue({
      hit: true,
      stale: true,
      value: [{ pageid: 1, title: "Old React", extract: "", description: "", thumbnail: "" }],
    });

    let subscriber;
    subscribeWikipediaCache.mockImplementation((_key, cb) => {
      subscriber = cb;
      return () => {};
    });

    // searchPages resolves later with updated list
    searchPages.mockResolvedValue([
      { pageid: 2, title: "New React", extract: "", description: "", thumbnail: "" },
    ]);

    renderAt("/search?q=react");

    // Cached data visible immediately
    expect(await screen.findByText("Old React")).toBeInTheDocument();
    expect(screen.getByText(/updating/i)).toBeInTheDocument();

    // Simulate background refresh update published by cache layer
    await act(async () => {
      subscriber?.([{ pageid: 2, title: "New React" }]);
    });

    expect(await screen.findByText("New React")).toBeInTheDocument();
  });

  test("abort / param change: stale results from prior query must not update after query changes", async () => {
    jest.useFakeTimers();

    const d1 = deferred();
    const d2 = deferred();

    searchPages
      .mockImplementationOnce(() => d1.promise) // first query
      .mockImplementationOnce(() => d2.promise); // second query

    render(
      <MemoryRouter initialEntries={["/search?q=first"]}>
        <Routes>
          <Route path="/search" element={<SearchResultsPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Navigate quickly to another query (new instance render via MemoryRouter entry push)
    render(
      <MemoryRouter initialEntries={["/search?q=second"]}>
        <Routes>
          <Route path="/search" element={<SearchResultsPage />} />
        </Routes>
      </MemoryRouter>
    );

    // Resolve first request after navigation: should not update UI of the second render
    await act(async () => {
      d1.resolve([{ pageid: 1, title: "FIRST_RESULT" }]);
      await d1.promise;
      jest.runOnlyPendingTimers();
    });

    expect(screen.queryByText("FIRST_RESULT")).toBeNull();

    // Resolve second request: should render
    await act(async () => {
      d2.resolve([{ pageid: 2, title: "SECOND_RESULT" }]);
      await d2.promise;
      jest.runOnlyPendingTimers();
    });

    expect(await screen.findByText("SECOND_RESULT")).toBeInTheDocument();

    jest.useRealTimers();
  });
});
