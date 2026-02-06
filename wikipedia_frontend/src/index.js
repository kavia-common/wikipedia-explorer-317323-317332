import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import "./i18n";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import { registerServiceWorker } from "./pwa/serviceWorkerRegistration";
import ThemeProvider from "./theme/ThemeContext";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <ThemeProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ThemeProvider>
    </ErrorBoundary>
  </React.StrictMode>
);

// Register SW after initial render; guarded internally for dev safety.
void registerServiceWorker();
