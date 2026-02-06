import React from "react";
import { act } from "react-dom/test-utils";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import CategoryPage from "../CategoryPage";

jest.mock("../../api/wikipedia", () => ({
  getCategoryMembersPage: jest.fn(),
  getCategorySubcategories: jest.fn(),
}));

const { getCategoryMembersPage, getCategorySubcategories } = require("../../api/wikipedia");

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function renderRoute(categoryName) {
  return render(
    <MemoryRouter initialEntries={[`/category/${encodeURIComponent(categoryName)}`]}>
      <Routes>
        <Route path="/category/:category" element={<CategoryPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("CategoryPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getCategorySubcategories.mockResolvedValue({ items: [], continueToken: null });
  });

  test("loading state renders shared LoadingState", () => {
    const d = deferred();
    getCategoryMembersPage.mockReturnValue(d.promise);

    renderRoute("Physics");

    expect(screen.getByRole("status")).toHaveTextContent(/loading category/i);
  });

  test("error state renders shared ErrorState", async () => {
    getCategoryMembersPage.mockRejectedValue(new Error("Nope"));

    renderRoute("Broken");

    expect(await screen.findByRole("alert")).toHaveTextContent(/unable to load category/i);
    expect(screen.getByRole("alert")).toHaveTextContent(/nope/i);
  });

  test("empty state renders when category has no members", async () => {
    getCategoryMembersPage.mockResolvedValue({ items: [], continueToken: null });

    renderRoute("Empty");

    expect(await screen.findByRole("note")).toHaveTextContent(/no pages found/i);
  });

  test("subcategories render when available (optional section)", async () => {
    getCategoryMembersPage.mockResolvedValue({ items: [], continueToken: null });
    getCategorySubcategories.mockResolvedValue({ items: ["SubcatA", "SubcatB"], continueToken: null });

    renderRoute("HasSubcats");

    const section = await screen.findByRole("region", { name: /subcategories/i });
    expect(section).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "SubcatA" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "SubcatB" })).toBeInTheDocument();
  });

  test("pagination: Load more appends members", async () => {
    getCategoryMembersPage
      .mockResolvedValueOnce({
        items: [{ pageid: 1, title: "Page1" }],
        continueToken: "NEXT",
      })
      .mockResolvedValueOnce({
        items: [{ pageid: 2, title: "Page2" }],
        continueToken: null,
      });

    renderRoute("Computing");

    expect(await screen.findByText("Page1")).toBeInTheDocument();

    const loadMore = await screen.findByRole("button", { name: /load more/i });
    const user = userEvent.setup();
    await user.click(loadMore);

    expect(await screen.findByText("Page2")).toBeInTheDocument();

    // Both items should exist (append, not replace)
    expect(screen.getByText("Page1")).toBeInTheDocument();
    expect(screen.getByText("Page2")).toBeInTheDocument();

    // End reached note
    expect(await screen.findByRole("note")).toHaveTextContent(/reached the end/i);
  });

  test("abort / param change: late resolution for prior category must not update UI", async () => {
    jest.useFakeTimers();

    const d1 = deferred();
    const d2 = deferred();

    getCategoryMembersPage
      .mockImplementationOnce(() => d1.promise) // category A
      .mockImplementationOnce(() => d2.promise); // category B

    render(
      <MemoryRouter initialEntries={["/category/A"]}>
        <Routes>
          <Route path="/category/:category" element={<CategoryPage />} />
        </Routes>
      </MemoryRouter>
    );

    render(
      <MemoryRouter initialEntries={["/category/B"]}>
        <Routes>
          <Route path="/category/:category" element={<CategoryPage />} />
        </Routes>
      </MemoryRouter>
    );

    await act(async () => {
      d1.resolve({ items: [{ pageid: 1, title: "A1" }], continueToken: null });
      await d1.promise;
      jest.runOnlyPendingTimers();
    });

    expect(screen.queryByText("A1")).toBeNull();

    await act(async () => {
      d2.resolve({ items: [{ pageid: 2, title: "B1" }], continueToken: null });
      await d2.promise;
      jest.runOnlyPendingTimers();
    });

    expect(await screen.findByText("B1")).toBeInTheDocument();

    jest.useRealTimers();
  });
});
