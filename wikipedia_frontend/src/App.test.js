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
