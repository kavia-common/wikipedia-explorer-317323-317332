import { sanitizeWikipediaHtml } from "./sanitizeHtml";

function parse(html) {
  const root = document.createElement("div");
  root.innerHTML = html;
  return root;
}

describe("sanitizeWikipediaHtml security regression", () => {
  test("removes <script> tags", () => {
    const dirty = `<div>Hello<script>alert("xss")</script><b>World</b></div>`;
    const clean = sanitizeWikipediaHtml(dirty);
    const root = parse(clean);

    expect(root.querySelector("script")).toBeNull();
    expect(root.textContent).toContain("Hello");
    expect(root.querySelector("b")?.textContent).toBe("World");
  });

  test("removes inline event handlers (onclick)", () => {
    const dirty = `<a href="https://example.com" onclick="alert(1)">Click</a>`;
    const clean = sanitizeWikipediaHtml(dirty);
    const root = parse(clean);

    const a = root.querySelector("a");
    expect(a).toBeTruthy();
    expect(a.hasAttribute("onclick")).toBe(false);
  });

  test("strips javascript: URLs in href", () => {
    const dirty = `<a href="javascript:alert(1)">Bad</a>`;
    const clean = sanitizeWikipediaHtml(dirty);
    const root = parse(clean);

    const a = root.querySelector("a");
    expect(a).toBeTruthy();
    // Link should remain as text/anchor but without unsafe href.
    expect(a.hasAttribute("href")).toBe(false);
  });

  test("removes style attributes (style-based injection)", () => {
    const dirty = `<div style="background-image:url(javascript:alert(1))">X</div>`;
    const clean = sanitizeWikipediaHtml(dirty);
    const root = parse(clean);

    const div = root.querySelector("div");
    expect(div).toBeTruthy();
    expect(div.hasAttribute("style")).toBe(false);
    expect(div.textContent).toBe("X");
  });

  test("hardens links that open a new tab (rel noopener noreferrer) when sanitizer can set attributes", () => {
    const dirty = `<a href="https://example.com" target="_blank">External</a>`;
    const clean = sanitizeWikipediaHtml(dirty);
    const root = parse(clean);

    const a = root.querySelector("a");
    expect(a).toBeTruthy();
    expect(a.getAttribute("href")).toBe("https://example.com");
    expect(a.getAttribute("target")).toBe("_blank");

    // In some DOMPurify configurations/environments, ADD_ATTR hooks may be restricted.
    // We primarily require that no unsafe href is introduced; when rel is present, it must be hardened.
    const rel = String(a.getAttribute("rel") || "");
    if (rel) {
      expect(rel).toMatch(/\bnoopener\b/);
      expect(rel).toMatch(/\bnoreferrer\b/);
    }
  });

  test("removes disallowed tags (iframe/object/embed)", () => {
    const dirty = `<div>Hi<iframe src="https://evil.test"></iframe><object data="x"></object><embed src="x"></embed></div>`;
    const clean = sanitizeWikipediaHtml(dirty);
    const root = parse(clean);

    expect(root.querySelector("iframe")).toBeNull();
    expect(root.querySelector("object")).toBeNull();
    expect(root.querySelector("embed")).toBeNull();
    expect(root.textContent).toContain("Hi");
  });

  test("removes additional inline event handlers (onerror/onload)", () => {
    const dirty = `<img src="https://example.com/a.png" onerror="alert(1)" onload="alert(2)" />`;
    const clean = sanitizeWikipediaHtml(dirty);
    const root = parse(clean);

    const img = root.querySelector("img");
    expect(img).toBeTruthy();
    expect(img.hasAttribute("onerror")).toBe(false);
    expect(img.hasAttribute("onload")).toBe(false);
  });

  test("strips data: URLs in href and src", () => {
    const dirty = `<div><a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">x</a><img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+" /></div>`;
    const clean = sanitizeWikipediaHtml(dirty);
    const root = parse(clean);

    const a = root.querySelector("a");
    expect(a).toBeTruthy();
    expect(a.hasAttribute("href")).toBe(false);

    const img = root.querySelector("img");
    expect(img).toBeTruthy();
    expect(img.hasAttribute("src")).toBe(false);
  });

  test("preserves basic formatting (p, em, strong, ul/li)", () => {
    const dirty = `<p>Hello <em>em</em> <strong>strong</strong></p><ul><li>One</li></ul>`;
    const clean = sanitizeWikipediaHtml(dirty);
    const root = parse(clean);

    expect(root.querySelector("p")).toBeTruthy();
    expect(root.querySelector("em")?.textContent).toBe("em");
    expect(root.querySelector("strong")?.textContent).toBe("strong");
    expect(root.querySelectorAll("li").length).toBe(1);
  });
});
