import React from "react";
import { useTranslation } from "react-i18next";
import styles from "./UIStates.module.css";

// PUBLIC_INTERFACE
export default function EmptyState({ title, description = "" }) {
  /** Shared empty state panel used across pages. */
  const { t } = useTranslation();

  const computedTitle = title ?? t("uiStates.emptyDefaultTitle");

  return (
    <div className={styles.panel} role="note">
      <div className={styles.title}>{computedTitle}</div>
      {description ? <div className={styles.description}>{description}</div> : null}
    </div>
  );
}
