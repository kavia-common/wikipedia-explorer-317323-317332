import { render, screen } from "@testing-library/react";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

test("renders app brand", () => {
  render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
  const brand = screen.getByText(/Wikipedia Explorer/i);
  expect(brand).toBeInTheDocument();
});

test("suggestions request is abortable (signal passed to fetch)", async () => {
  const fetchSpy = jest
    .spyOn(global, "fetch")
    .mockResolvedValue({
      ok: true,
      json: async () => ["a", ["Alpha"], [], []],
      text: async () => "",
    });

  render(
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );

  const input = screen.getByLabelText(/Search Wikipedia/i);
  // Type enough characters to trigger suggestions.
  input.focus();
  input.dispatchEvent(new Event("input", { bubbles: true }));

  // React Testing Library recommends fireEvent/userEvent, but keep minimal:
  // set value + dispatch input event.
  input.value = "Al";
  input.dispatchEvent(new Event("input", { bubbles: true }));

  // Wait for fetch to be called.
  await screen.findByText("Alpha");

  const [, options] = fetchSpy.mock.calls[0];
  expect(options).toBeTruthy();
  expect(options.signal).toBeInstanceOf(AbortSignal);

  fetchSpy.mockRestore();
});
