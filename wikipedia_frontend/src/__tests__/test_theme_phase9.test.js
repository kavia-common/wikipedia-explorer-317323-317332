import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import ThemeProvider from "../theme/ThemeContext";
import App from "../App";

// Mock wikipedia API calls that can fire from SearchBar, similar to App.test.js
jest.mock("../api/wikipedia", () => {
  const actual = jest.requireActual("../api/wikipedia");
  return {
    ...actual,
    getSearchSuggestions: jest.fn().mockResolvedValue([]),
  };
});

function setMatchMediaPrefersDark(prefersDark) {
  // Minimal matchMedia mock with event support
  let listeners = new Set();

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query) => {
      const mql = {
        media: query,
        matches: query.includes("prefers-color-scheme") ? prefersDark : false,
        onchange: null,
        addEventListener: (event, cb) => {
          if (event === "change") listeners.add(cb);
        },
        removeEventListener: (event, cb) => {
          if (event === "change") listeners.delete(cb);
        },
        // Safari legacy
        addListener: (cb) => listeners.add(cb),
        removeListener: (cb) => listeners.delete(cb),
        /** simulate change */
        __dispatchChange: (nextMatches) => {
          mql.matches = nextMatches;
          for (const cb of listeners) cb({ matches: nextMatches });
        },
      };
      return mql;
    },
  });
}

function renderApp() {
  return render(
    <ThemeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  );
}

describe("Phase 9 theming", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    window.localStorage.clear();
  });

  test("defaults to system preference when no user choice exists", () => {
    setMatchMediaPrefersDark(true);
    renderApp();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  test("theme toggle updates root attribute and persists", async () => {
    setMatchMediaPrefersDark(false);
    renderApp();

    // Initial from system
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    const user = userEvent.setup();
    const toggle = screen.getByRole("button", { name: /switch to dark theme/i });
    await user.click(toggle);

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(window.localStorage.getItem("wikiExplorer.theme")).toBe("dark");
  });

  test("persists across reloads (user choice overrides system)", () => {
    setMatchMediaPrefersDark(false);
    window.localStorage.setItem("wikiExplorer.theme", "dark");

    renderApp();
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });
});
