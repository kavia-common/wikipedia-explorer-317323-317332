import React from "react";
import styles from "./UIStates.module.css";

// PUBLIC_INTERFACE
export default function ErrorState({
  title = "Something went wrong",
  description = "",
  onRetry,
  retryLabel = "Retry",
}) {
  /** Shared error state panel used across pages. */
  return (
    <div className={styles.errorPanel} role="alert">
      <div className={styles.errorTitle}>{title}</div>
      {description ? <div className={styles.description}>{description}</div> : null}
      {onRetry ? (
        <button type="button" className={styles.retryButton} onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}
