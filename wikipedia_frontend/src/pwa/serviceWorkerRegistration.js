/**
 * Service worker registration utilities (scoped PWA support).
 *
 * CRA will serve /service-worker.js from the public folder at the root scope.
 * We keep registration guarded for dev safety while being production-ready.
 */

/**
 * Returns true if the current environment should register a service worker.
 * We also require secure context (https or localhost) to avoid noisy failures.
 */
function shouldRegisterServiceWorker() {
  const env = process.env.REACT_APP_NODE_ENV || process.env.NODE_ENV;
  const isProd = env === "production";
  const isBrowser = typeof window !== "undefined" && typeof navigator !== "undefined";
  const hasSW = isBrowser && "serviceWorker" in navigator;

  // Secure contexts: https OR localhost
  const isLocalhost =
    isBrowser &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1" ||
      window.location.hostname === "[::1]");

  const isSecure =
    isBrowser && (window.location.protocol === "https:" || isLocalhost);

  return Boolean(isProd && hasSW && isSecure);
}

// PUBLIC_INTERFACE
export async function registerServiceWorker() {
  /** Register the app service worker in production-safe conditions. */
  if (!shouldRegisterServiceWorker()) return null;

  try {
    // Use root scope so it controls all routes.
    const reg = await navigator.serviceWorker.register("/service-worker.js");

    // If an update is found, the new SW will wait until all tabs are closed.
    // This is fine for our app shell/runtime caching.
    return reg;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("Service worker registration failed:", e);
    return null;
  }
}

// PUBLIC_INTERFACE
export async function triggerResync() {
  /**
   * Ask the service worker to refresh runtime caches for "recent" content.
   * Safe no-op if SW isn't active.
   */
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const controller = navigator.serviceWorker.controller;
    if (!controller) return;

    controller.postMessage({ type: "WIKI_RESYNC" });
  } catch {
    // ignore
  }
}
