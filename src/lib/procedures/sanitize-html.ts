/**
 * Lightweight HTML sanitizer for the procedure rich-text body.
 *
 * The content originates from a local contentEditable surface, but we still strip scripts,
 * event handlers, and dangerous URLs so stored/rendered HTML stays safe across devices.
 */
const ALLOWED_TAGS = new Set([
  "p",
  "br",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "h1",
  "h2",
  "h3",
  "h4",
  "blockquote",
  "code",
  "pre",
  "a",
  "div",
  "span"
]);

const ALLOWED_ATTRS: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"])
};

function isSafeHref(href: string): boolean {
  const v = href.trim().toLowerCase();
  if (v.startsWith("javascript:") || v.startsWith("data:") || v.startsWith("vbscript:")) {
    return false;
  }
  return true;
}

function sanitizeNode(node: Node, doc: Document): void {
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();
      if (!ALLOWED_TAGS.has(tag)) {
        // Unwrap unknown elements: keep their (sanitized) children, drop the wrapper.
        sanitizeNode(el, doc);
        const parent = el.parentNode;
        if (parent) {
          while (el.firstChild) parent.insertBefore(el.firstChild, el);
          parent.removeChild(el);
        }
        continue;
      }
      const allowed = ALLOWED_ATTRS[tag] ?? new Set<string>();
      for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();
        if (!allowed.has(name)) {
          el.removeAttribute(attr.name);
          continue;
        }
        if (name === "href" && !isSafeHref(attr.value)) {
          el.removeAttribute(attr.name);
        }
      }
      if (tag === "a" && el.getAttribute("href")) {
        el.setAttribute("target", "_blank");
        el.setAttribute("rel", "noopener noreferrer");
      }
      sanitizeNode(el, doc);
    } else if (child.nodeType === Node.COMMENT_NODE) {
      child.parentNode?.removeChild(child);
    }
  }
}

export function sanitizeProcedureHtml(html: string): string {
  if (!html) return "";
  if (typeof document === "undefined" || typeof DOMParser === "undefined") {
    // SSR / no-DOM fallback: strip obvious script blocks.
    return html.replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, "");
  }
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  doc.querySelectorAll("script, style, iframe, object, embed, link, meta").forEach((n) => n.remove());
  sanitizeNode(doc.body, doc);
  return doc.body.innerHTML.trim();
}

/** Plain-text projection of the body, used for search and list previews. */
export function procedureHtmlToText(html: string): string {
  if (!html) return "";
  if (typeof document === "undefined" || typeof DOMParser === "undefined") {
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}
