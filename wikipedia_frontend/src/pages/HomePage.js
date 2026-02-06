import React from "react";
import styles from "./HomePage.module.css";

// PUBLIC_INTERFACE
export default function HomePage() {
  /** Landing page prompting users to search. */
  return (
    <div className={styles.wrap}>
      <div className={styles.hero}>
        <h1 className={styles.title}>Wikipedia Explorer</h1>
        <p className={styles.subtitle}>
          Search, read, and browse categories—powered directly by the public Wikipedia API.
        </p>
      </div>

      <div className={styles.tips}>
        <div className={styles.tipCard}>
          <div className={styles.tipTitle}>Try searching for</div>
          <div className={styles.tipBody}>“Solar eclipse”, “Ada Lovelace”, “Jazz”, “Machine learning”</div>
        </div>
        <div className={styles.tipCard}>
          <div className={styles.tipTitle}>Browse categories</div>
          <div className={styles.tipBody}>Open an article and explore its categories to discover more pages.</div>
        </div>
      </div>
    </div>
  );
}
