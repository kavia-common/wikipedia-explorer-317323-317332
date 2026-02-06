import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import App from "../../App";
import i18n, { LS_LANG_KEY } from "../index";
import { getWikipediaBaseUrl, setWikipediaLanguage } from "../../api/wikipedia";
import { cacheKeys } from "../../api/cache";

describe("Phase 8 i18n", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset language to en for test isolation.
    void i18n.changeLanguage("en");
    setWikipediaLanguage("en");
  });

  test("language switch updates UI strings (Home subtitle)", async () => {
    const user = userEvent.setup();

    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    // English subtitle should appear.
    expect(
      screen.getByText(/powered directly by the public wikipedia api/i)
    ).toBeInTheDocument();

    // Switch to Spanish.
    const selector = screen.getByRole("combobox", { name: /language|idioma/i });
    await user.selectOptions(selector, "es");

    expect(
      screen.getByText(/con la api pública de wikipedia/i)
    ).toBeInTheDocument();
  });

  test("persisted preference is reapplied (i18n init reads localStorage)", async () => {
    localStorage.setItem(LS_LANG_KEY, "es");

    // Re-import module in isolated environment to simulate "reload" init.
    jest.resetModules();
    const fresh = require("../index");
    const freshI18n = fresh.default;

    expect(freshI18n.language).toBe("es");
  });

  test("Wikipedia API base changes per language (default subdomain behavior)", () => {
    // If the app uses ENV_WIKI_BASE, it will override subdomains. In tests, env is unset.
    expect(getWikipediaBaseUrl("en")).toMatch(/^https:\/\/en\.wikipedia\.org/);
    expect(getWikipediaBaseUrl("es")).toMatch(/^https:\/\/es\.wikipedia\.org/);
  });

  test("cache keys incorporate language (no collisions)", () => {
    const enKey = cacheKeys.summary("Ada Lovelace", { lang: "en" });
    const esKey = cacheKeys.summary("Ada Lovelace", { lang: "es" });
    expect(enKey).not.toEqual(esKey);

    const enSearch = cacheKeys.search("cats", 20, { lang: "en" });
    const esSearch = cacheKeys.search("cats", 20, { lang: "es" });
    expect(enSearch).not.toEqual(esSearch);
  });
});
