import DOMPurify from "dompurify";

// PUBLIC_INTERFACE
export function sanitizeWikipediaHtml(html) {
  /**
   * Sanitize HTML content from Wikipedia before rendering.
   * Keeps typical formatting while removing scripts/unsafe attributes.
   */
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    // Avoid exposing target=_blank opener issues if any links are kept.
    ADD_ATTR: ["target", "rel"],
  });
}
