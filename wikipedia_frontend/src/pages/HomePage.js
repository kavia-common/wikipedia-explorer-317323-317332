import React from "react";
import { useTranslation } from "react-i18next";
import styles from "./HomePage.module.css";

// PUBLIC_INTERFACE
export default function HomePage() {
  /** Landing page prompting users to search. */
  const { t } = useTranslation();

  return (
    <div className={styles.wrap}>
      <div className={styles.hero}>
        <h1 className={styles.title}>{t("app.name")}</h1>
        <p className={styles.subtitle}>{t("home.subtitle")}</p>
      </div>

      <div className={styles.tips}>
        <div className={styles.tipCard}>
          <div className={styles.tipTitle}>{t("home.trySearchingFor")}</div>
          <div className={styles.tipBody}>{t("home.trySearchingForExamples")}</div>
        </div>
        <div className={styles.tipCard}>
          <div className={styles.tipTitle}>{t("home.browseCategories")}</div>
          <div className={styles.tipBody}>{t("home.browseCategoriesBody")}</div>
        </div>
      </div>
    </div>
  );
}
