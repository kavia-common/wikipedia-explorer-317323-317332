import { act } from "react-dom/test-utils";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

jest.mock("./api/wikipedia", () => {
  // Keep everything else real except what App test needs.
  const actual = jest.requireActual("./api/wikipedia");
  return {
    ...actual,
    getSearchSuggestions: jest.fn(),
  };
});

const { getSearchSuggestions } = require("./api/wikipedia");

describe("App", () => {
  test("renders app brand (header link)", () => {
    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    // Be specific to avoid multiple matches ("Wikipedia Explorer" appears in hero too).
    const homeLink = screen.getByRole("link", { name: /wikipedia explorer home/i });
    expect(homeLink).toBeInTheDocument();
  });

  test("suggestions request receives an AbortSignal", async () => {
    jest.useFakeTimers();

    getSearchSuggestions.mockResolvedValue(["Alpha"]);

    render(
      <BrowserRouter>
        <App />
      </BrowserRouter>
    );

    const input = screen.getByRole("combobox", { name: /search wikipedia/i });

    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
    await user.click(input);
    await user.type(input, "Al");

    // Flush the SearchBar debounce window.
    await act(async () => {
      jest.advanceTimersByTime(350);
    });

    // Ensure the mock was called and received a signal option.
    expect(getSearchSuggestions).toHaveBeenCalledTimes(1);
    const options = getSearchSuggestions.mock.calls[0][2];
    expect(options).toBeTruthy();
    expect(options.signal).toBeInstanceOf(AbortSignal);

    jest.useRealTimers();
  });
});
