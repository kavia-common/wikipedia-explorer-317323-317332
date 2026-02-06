import React from "react";
import { Link } from "react-router-dom";
import styles from "./ArticleCard.module.css";

// PUBLIC_INTERFACE
export default function ArticleCard({ title, extract, description, thumbnail, to }) {
  /** Compact card view of a Wikipedia article. */
  const href = to || `/article/${encodeURIComponent(title)}`;

  return (
    <Link className={styles.card} to={href}>
      {thumbnail ? (
        <img className={styles.thumb} src={thumbnail} alt="" loading="lazy" />
      ) : (
        <div className={styles.thumbPlaceholder} aria-hidden="true">
          W
        </div>
      )}
      <div className={styles.body}>
        <div className={styles.title}>{title}</div>
        {description ? <div className={styles.desc}>{description}</div> : null}
        {extract ? <div className={styles.extract}>{extract}</div> : null}
      </div>
    </Link>
  );
}
