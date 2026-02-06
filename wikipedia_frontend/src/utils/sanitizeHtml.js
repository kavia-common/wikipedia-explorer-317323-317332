import DOMPurify from "dompurify";

/**
 * Protocols we allow in href/src-like attributes.
 * - Allow http(s), mailto, tel
 * - Allow relative and hash URLs (no protocol)
 * - Explicitly block javascript: and data: URIs
 */
function isSafeUrlValue(value) {
  const raw = String(value || "").trim();

  if (!raw) return true;

  // Relative / hash links are OK (Wikipedia uses these heavily).
  if (raw.startsWith("/") || raw.startsWith("#") || raw.startsWith("./") || raw.startsWith("../")) {
    return true;
  }

  // Normalize for comparisons.
  const lower = raw.replace(/\s+/g, "").toLowerCase();

  if (lower.startsWith("javascript:")) return false;
  if (lower.startsWith("data:")) return false;

  try {
    const u = new URL(raw);
    const proto = u.protocol.toLowerCase();
    return proto === "http:" || proto === "https:" || proto === "mailto:" || proto === "tel:";
  } catch {
    // If it's not parseable as an absolute URL, treat as unsafe unless it was
    // clearly relative (handled above).
    return false;
  }
}

// PUBLIC_INTERFACE
export function sanitizeWikipediaHtml(html) {
  /**
   * Sanitize HTML content from Wikipedia before rendering.
   *
   * Security goals:
   * - Remove scripts and dangerous embedded content (iframe/object/embed).
   * - Strip event handlers (on*) and style attributes (style-based injection).
   * - Block javascript: and data: URIs in href/src/xlink:href.
   * - Harden outgoing links that open new tabs (rel=noopener noreferrer).
   *
   * UX goals:
   * - Preserve typical Wikipedia formatting (links, headings, lists, tables).
   */
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },

    // We intentionally allow DOMPurify to keep most safe HTML, but explicitly
    // remove high-risk tags that aren't needed for Wikipedia rendering in this app.
    FORBID_TAGS: [
      "script",
      "iframe",
      "object",
      "embed",
      "applet",
      "form",
      "input",
      "button",
      "textarea",
      "select",
      "option",
      "noscript",
      "meta",
      "link",
      "base",
    ],

    // Block attributes commonly used for XSS or that can bypass URL checks.
    // - style: can contain url(javascript:...) or other exfil tricks
    // - on*: handled in hook too, but forbid provides defense-in-depth
    // - srcset: can hide javascript/data in some contexts; not needed here
    FORBID_ATTR: ["style", "srcset"],

    // We'll set these ourselves in hooks after sanitization.
    ADD_ATTR: ["target", "rel"],

    /**
     * Strip dangerous attributes and protocols before DOMPurify does its own filtering.
     */
    hooks: {
      beforeSanitizeAttributes(node) {
        // Remove any inline event handlers (onclick, onload, ...).
        // DOMPurify typically removes these, but we ensure it explicitly.
        if (node && node.attributes) {
          // Iterate backwards since we may remove attributes.
          for (let i = node.attributes.length - 1; i >= 0; i -= 1) {
            const attr = node.attributes[i];
            const name = String(attr?.name || "").toLowerCase();
            if (name.startsWith("on")) {
              node.removeAttribute(attr.name);
            }
          }
        }

        // Enforce safe URL protocols on href/src/xlink:href.
        const urlAttrs = ["href", "src", "xlink:href"];
        urlAttrs.forEach((attr) => {
          if (!node?.hasAttribute?.(attr)) return;
          const v = node.getAttribute(attr);
          if (!isSafeUrlValue(v)) {
            node.removeAttribute(attr);
          }
        });

        // Remove style attribute explicitly (defense-in-depth with FORBID_ATTR).
        if (node?.hasAttribute?.("style")) node.removeAttribute("style");
      },

      /**
       * Link hardening after sanitization:
       * - If a link opens a new tab, ensure rel includes noopener noreferrer.
       */
      afterSanitizeAttributes(node) {
        if (!node || node.nodeName?.toLowerCase?.() !== "a") return;

        const target = node.getAttribute("target");
        if (target && String(target).toLowerCase() === "_blank") {
          const existingRel = String(node.getAttribute("rel") || "");
          const tokens = new Set(
            existingRel
              .split(/\s+/)
              .map((t) => t.trim().toLowerCase())
              .filter(Boolean)
          );
          tokens.add("noopener");
          tokens.add("noreferrer");
          node.setAttribute("rel", Array.from(tokens).join(" "));
        }
      },
    },
  });
}
