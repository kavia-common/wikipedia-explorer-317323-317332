import React from "react";
import styles from "./UIStates.module.css";

// PUBLIC_INTERFACE
export default function EmptyState({ title = "Nothing here yet", description = "" }) {
  /** Shared empty state panel used across pages. */
  return (
    <div className={styles.panel} role="note">
      <div className={styles.title}>{title}</div>
      {description ? <div className={styles.description}>{description}</div> : null}
    </div>
  );
}
