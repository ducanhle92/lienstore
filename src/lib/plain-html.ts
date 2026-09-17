/**
 * Plain text ⇄ simple HTML for the description boxes in admin: the owner types natural language (paragraphs separated
 * by a blank line, single line breaks kept), the storefront keeps receiving `<p>…</p>` HTML. Content that already
 * carries richer markup (links, bold, lists) passes through untouched in both directions so nothing is lost.
 * Pure (no DOM).
 */
const SIMPLE_TAGS = /^(p|br|\/p)$/i;

/** True when the HTML only uses <p> and <br> — i.e. it can be shown as plain paragraphs without losing anything. */
export function isSimpleHtml(html: string): boolean {
  const tags = [...html.matchAll(/<\s*(\/?[a-zA-Z][a-zA-Z0-9]*)[^>]*>/g)].map((m) => m[1]);
  return tags.every((t) => SIMPLE_TAGS.test(t));
}

const decode = (s: string) =>
  s
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&");
const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Simple HTML → paragraphs separated by a blank line (<br> = line break). Richer HTML is returned unchanged. */
export function htmlToPlain(html: string): string {
  const h = (html ?? "").trim();
  if (!h) return "";
  if (!isSimpleHtml(h)) return h;
  return decode(
    h
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>\s*<p[^>]*>/gi, "\n\n")
      .replace(/<\/?p[^>]*>/gi, ""),
  )
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Plain paragraphs → <p>…</p> (single newlines → <br>). Text that already contains tags is kept as-is. */
export function plainToHtml(text: string): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  if (/<\s*[a-zA-Z][^>]*>/.test(t)) return t;
  return t
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escape(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
