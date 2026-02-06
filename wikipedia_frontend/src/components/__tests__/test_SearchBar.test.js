import React from "react";
import { act } from "react-dom/test-utils";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SearchBar from "../SearchBar";

jest.mock("../../api/wikipedia", () => ({
  getSearchSuggestions: jest.fn(),
}));

const { getSearchSuggestions } = require("../../api/wikipedia");

function setNavigatorOnLine(value) {
  Object.defineProperty(window.navigator, "onLine", {
    value,
    configurable: true,
  });
}

describe("SearchBar", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    setNavigatorOnLine(true);
  });

  test("debounces suggestions calls: rapid typing triggers only one request within the window", async () => {
    jest.useFakeTimers();

    getSearchSuggestions.mockResolvedValue(["Alpha", "Alpine"]);

    const onSubmit = jest.fn();
    render(<SearchBar onSubmit={onSubmit} inputId="site-search" />);

    const input = screen.getByRole("combobox", { name: /search wikipedia/i });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    // Rapid typing should not trigger requests until debounce elapses.
    await user.click(input);
    await user.type(input, "A");
    await user.type(input, "l");
    await user.type(input, "p");

    expect(getSearchSuggestions).toHaveBeenCalledTimes(0);

    await act(async () => {
      jest.advanceTimersByTime(310);
    });

    expect(getSearchSuggestions).toHaveBeenCalledTimes(1);
    expect(getSearchSuggestions).toHaveBeenCalledWith(
      "Alp",
      8,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );

    // Suggestions should become visible.
    expect(await screen.findByRole("listbox", { name: /suggestions/i })).toBeInTheDocument();

    jest.useRealTimers();
  });

  test("keyboard navigation: ArrowDown/Up updates aria-activedescendant and aria-selected; Enter selects; Escape closes", async () => {
    jest.useFakeTimers();

    getSearchSuggestions.mockResolvedValue(["Alpha", "Beta", "Gamma"]);
    const onSubmit = jest.fn();

    render(<SearchBar onSubmit={onSubmit} inputId="site-search" />);

    const input = screen.getByRole("combobox", { name: /search wikipedia/i });
    expect(input).toHaveAttribute("aria-autocomplete", "list");

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await user.click(input);
    await user.type(input, "Al");

    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    const listbox = await screen.findByRole("listbox", { name: /suggestions/i });
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(input).toHaveAttribute("aria-controls", listbox.getAttribute("id"));

    // ArrowDown -> first option active
    await user.keyboard("{ArrowDown}");
    expect(input.getAttribute("aria-activedescendant")).toBeTruthy();

    const options = within(listbox).getAllByRole("option");
    expect(options).toHaveLength(3);
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    // ArrowDown -> second option active
    await user.keyboard("{ArrowDown}");
    expect(options[1]).toHaveAttribute("aria-selected", "true");
    expect(options[0]).toHaveAttribute("aria-selected", "false");

    // ArrowUp -> back to first
    await user.keyboard("{ArrowUp}");
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    // Enter selects active option
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith("Alpha");

    // Re-open and then Escape closes
    await user.click(input);
    await act(async () => {
      jest.advanceTimersByTime(350);
    });
    expect(await screen.findByRole("listbox", { name: /suggestions/i })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox", { name: /suggestions/i })).toBeNull();
    expect(input).toHaveAttribute("aria-expanded", "false");

    jest.useRealTimers();
  });

  test("offline recent searches fallback: when offline, focusing shows recents and clicking submits", async () => {
    setNavigatorOnLine(false);

    localStorage.setItem("wiki_recent_searches_v1", JSON.stringify(["Cats", "Dogs"]));

    // If offline, even if API is called it might fail; ensure recents appear regardless.
    getSearchSuggestions.mockRejectedValue(new Error("Network down"));

    const onSubmit = jest.fn();
    render(<SearchBar onSubmit={onSubmit} inputId="site-search" />);

    const input = screen.getByRole("combobox", { name: /search wikipedia/i });
    const user = userEvent.setup();

    await user.click(input);

    const listbox = await screen.findByRole("listbox", { name: /suggestions/i });
    expect(within(listbox).getByText(/recent searches \(offline\)/i)).toBeInTheDocument();

    const cats = within(listbox).getByRole("option", { name: "Cats" });
    await user.click(cats);

    expect(onSubmit).toHaveBeenCalledWith("Cats");
    // List should close after submit
    expect(screen.queryByRole("listbox", { name: /suggestions/i })).toBeNull();
  });

  test("API error while offline shows recent searches (fallback), not an empty list", async () => {
    jest.useFakeTimers();
    setNavigatorOnLine(false);

    localStorage.setItem("wiki_recent_searches_v1", JSON.stringify(["Ada Lovelace"]));
    getSearchSuggestions.mockRejectedValue(new Error("Fetch failed"));

    render(<SearchBar onSubmit={jest.fn()} inputId="site-search" />);

    const input = screen.getByRole("combobox", { name: /search wikipedia/i });
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    await user.click(input);
    await user.type(input, "Ad");

    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    const listbox = await screen.findByRole("listbox", { name: /suggestions/i });
    expect(within(listbox).getByRole("option", { name: "Ada Lovelace" })).toBeInTheDocument();

    jest.useRealTimers();
  });
});
