import React from "react";
import { useTranslation } from "react-i18next";
import styles from "./UIStates.module.css";

// PUBLIC_INTERFACE
export default function ErrorState({ title, description = "", onRetry, retryLabel }) {
  /** Shared error state panel used across pages. */
  const { t } = useTranslation();

  const computedTitle = title ?? t("errors.somethingWentWrong");
  const computedRetryLabel = retryLabel ?? t("common.tryAgain");

  return (
    <div className={styles.errorPanel} role="alert">
      <div className={styles.errorTitle}>{computedTitle}</div>
      {description ? <div className={styles.description}>{description}</div> : null}
      {onRetry ? (
        <button type="button" className={styles.retryButton} onClick={onRetry}>
          {computedRetryLabel}
        </button>
      ) : null}
    </div>
  );
}
