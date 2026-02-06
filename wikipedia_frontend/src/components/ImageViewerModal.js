import React, { useEffect, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";
import styles from "./ImageViewerModal.module.css";

/**
 * Minimal focus trap: keeps tab focus within the modal while open.
 */
function getFocusableElements(root) {
  if (!root) return [];
  const selectors = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ];
  return Array.from(root.querySelectorAll(selectors.join(","))).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden";
  });
}

// PUBLIC_INTERFACE
export default function ImageViewerModal({ open, images, activeIndex, onClose, onPrev, onNext }) {
  /**
   * Accessible modal viewer for in-article images.
   *
   * Keyboard:
   * - Escape closes
   * - Left/Right arrows navigate (when multiple)
   * - Tab is focus-trapped within modal
   */
  const { t } = useTranslation();
  const dialogRef = useRef(null);
  const closeBtnRef = useRef(null);
  const lastActiveElementRef = useRef(null);

  const hasMany = (images?.length || 0) > 1;

  const active = useMemo(() => {
    if (!Array.isArray(images) || images.length === 0) return null;
    const i = Math.max(0, Math.min(activeIndex || 0, images.length - 1));
    return images[i] || null;
  }, [images, activeIndex]);

  useEffect(() => {
    if (!open) return undefined;

    lastActiveElementRef.current = document.activeElement;

    // Prevent background scroll while open.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Focus close button (or dialog) after mount.
    const id = window.setTimeout(() => {
      (closeBtnRef.current || dialogRef.current)?.focus?.();
    }, 0);

    return () => {
      window.clearTimeout(id);
      document.body.style.overflow = prevOverflow;

      // Restore focus to whatever was active before modal opened.
      const prev = lastActiveElementRef.current;
      if (prev && typeof prev.focus === "function") prev.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (e) => {
      if (!open) return;

      if (e.key === "Escape") {
        e.preventDefault();
        onClose?.();
        return;
      }

      if (hasMany && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        if (e.key === "ArrowLeft") onPrev?.();
        else onNext?.();
        return;
      }

      if (e.key === "Tab") {
        const root = dialogRef.current;
        const focusables = getFocusableElements(root);
        if (focusables.length === 0) {
          e.preventDefault();
          root?.focus?.();
          return;
        }
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const current = document.activeElement;

        if (e.shiftKey) {
          if (current === first || !root.contains(current)) {
            e.preventDefault();
            last.focus();
          }
        } else {
          if (current === last) {
            e.preventDefault();
            first.focus();
          }
        }
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [open, hasMany, onClose, onPrev, onNext]);

  if (!open) return null;

  const caption = active?.caption || "";
  const alt = active?.alt || "";
  const src = active?.src || "";

  const title = hasMany
    ? t("mediaViewer.titleWithCount", { index: (activeIndex || 0) + 1, count: images.length })
    : t("mediaViewer.title");

  const describedById = caption || alt ? "image-viewer-desc" : undefined;

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onMouseDown={(e) => {
        // Only close when clicking the backdrop itself (not when dragging/clicking inside dialog).
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-describedby={describedById}
        ref={dialogRef}
        tabIndex={-1}
      >
        <div className={styles.header}>
          <div className={styles.headerTitle}>{title}</div>
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => onClose?.()}
            aria-label={t("mediaViewer.close")}
            ref={closeBtnRef}
          >
            ×
          </button>
        </div>

        <div className={styles.body}>
          <figure className={styles.figure}>
            {/* src is already sanitized upstream; this is just a plain <img>. */}
            <img className={styles.image} src={src} alt={alt} />
            {(caption || alt) && (
              <figcaption id="image-viewer-desc" className={styles.caption}>
                {caption ? (
                  <>
                    <span className={styles.captionLabel}>{t("mediaViewer.captionLabel")}:</span>{" "}
                    {caption}
                  </>
                ) : (
                  <>
                    <span className={styles.captionLabel}>{t("mediaViewer.altLabel")}:</span> {alt}
                  </>
                )}
              </figcaption>
            )}
          </figure>
        </div>

        {hasMany ? (
          <div className={styles.footer}>
            <button
              type="button"
              className={styles.navButton}
              onClick={() => onPrev?.()}
              aria-label={t("mediaViewer.previous")}
            >
              {t("mediaViewer.previous")}
            </button>
            <button
              type="button"
              className={styles.navButton}
              onClick={() => onNext?.()}
              aria-label={t("mediaViewer.next")}
            >
              {t("mediaViewer.next")}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
