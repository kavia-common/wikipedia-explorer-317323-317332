import React from "react";
import { Link } from "react-router-dom";
import styles from "./CategoryList.module.css";

// PUBLIC_INTERFACE
export default function CategoryList({ categories, linkState }) {
  /** Shows list of categories as navigable chips. */
  if (!categories || categories.length === 0) return null;

  return (
    <nav className={styles.wrap} aria-label="Categories">
      {categories.map((c) => (
        <Link
          key={c}
          className={styles.chip}
          to={`/category/${encodeURIComponent(c)}`}
          state={linkState}
        >
          {c}
        </Link>
      ))}
    </nav>
  );
}
