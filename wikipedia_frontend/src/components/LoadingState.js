import React from "react";
import { useTranslation } from "react-i18next";
import styles from "./UIStates.module.css";

// PUBLIC_INTERFACE
export default function LoadingState({ title, description = "" }) {
  /** Shared loading state panel used across pages. */
  const { t } = useTranslation();
  const computedTitle = title ?? t("common.loading");

  return (
    <div className={styles.panel} role="status" aria-live="polite">
      <div className={styles.title}>{computedTitle}</div>
      {description ? <div className={styles.description}>{description}</div> : null}
    </div>
  );
}
