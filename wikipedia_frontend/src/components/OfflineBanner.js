import React, { useEffect, useState } from "react";
import { triggerResync } from "../pwa/serviceWorkerRegistration";
import styles from "./OfflineBanner.module.css";

function getOnline() {
  // navigator.onLine is imperfect, but it's a useful UI hint.
  return typeof navigator !== "undefined" ? navigator.onLine !== false : true;
}

// PUBLIC_INTERFACE
export default function OfflineBanner() {
  /** Visible banner when offline; triggers cache resync when back online. */
  const [online, setOnline] = useState(getOnline());

  useEffect(() => {
    function onOnline() {
      setOnline(true);
      // When connectivity returns, ask the SW to refresh "recent" runtime caches.
      // This keeps UI caches (Phase 3) intact while ensuring network freshness.
      triggerResync();
    }

    function onOffline() {
      setOnline(false);
    }

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div className={styles.banner} role="status" aria-live="polite">
      <div className={styles.text}>
        You’re offline. Previously viewed pages may still be available.
      </div>
    </div>
  );
}
