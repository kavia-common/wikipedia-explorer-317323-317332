import React from "react";
import styles from "./UIStates.module.css";

// PUBLIC_INTERFACE
export default function LoadingState({ title = "Loading…", description = "" }) {
  /** Shared loading state panel used across pages. */
  return (
    <div className={styles.panel} role="status" aria-live="polite">
      <div className={styles.title}>{title}</div>
      {description ? <div className={styles.description}>{description}</div> : null}
    </div>
  );
}
