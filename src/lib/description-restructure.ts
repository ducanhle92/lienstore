/**
 * Turn a one-paragraph product description with inline labels ("Công dụng: … Thành phần chính: … Cách dùng: … Lưu ý: …")
 * into the headed sections `structureDescription` (lib/description.ts) renders as Công dụng / Thành phần / Hướng dẫn
 * sử dụng / Lưu ý & bảo quản — the shape the admin "Soạn theo mục" editor edits. Pure; returns null when the text does
 * not carry at least two known labels, so anything else is left exactly as it is.
 */

const LABELS: Array<[RegExp, string]> = [
  [/^(công dụng|tác dụng)$/i, "Công dụng"],
  [/^thành phần( chính)?$/i, "Thành phần"],
  [/^(cách dùng|cách sử dụng|hướng dẫn sử dụng|liều dùng)$/i, "Hướng dẫn sử dụng"],
  [/^(lưu ý|bảo quản)$/i, "Lưu ý &amp; bảo quản"],
  [/^đối tượng( sử dụng)?$/i, "Đối tượng sử dụng"],
];
const LABEL_RE = /(^|[.;!?)]\s+)(Công dụng|Tác dụng|Thành phần chính|Thành phần|Cách dùng|Cách sử dụng|Hướng dẫn sử dụng|Liều dùng|Lưu ý|Bảo quản|Đối tượng sử dụng|Đối tượng)\s*:\s*/gi;
const SOURCE_NOTE_RE = /\s*\((theo|nguồn)[^)]*\)\s*\.?\s*$/i;

const headingOf = (label: string): string => LABELS.find(([re]) => re.test(label.trim()))?.[1] ?? label.trim();
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** "a; b; c" → bullets when there are at least two parts, else one paragraph. */
function renderBody(body: string): string {
  const parts = body
    .split(/;\s+/)
    .map((s) => s.trim().replace(/[.;]$/, "").trim())
    .filter(Boolean);
  if (parts.length >= 2) return `<ul>${parts.map((p) => `<li>${cap(p)}</li>`).join("")}</ul>`;
  const one = body.trim();
  return one ? `<p>${cap(one)}</p>` : "";
}

export function restructureInlineDescription(html: string): string | null {
  if (!html || /<h[1-6]\b/i.test(html)) return null;
  const facts = /^\s*<ul>[\s\S]*?<\/ul>/i.exec(html);
  const rest = html.slice(facts ? facts[0].length : 0).trim();
  const para = /^<p>([\s\S]*)<\/p>$/i.exec(rest);
  if (!para || /<[a-z]/i.test(para[1])) return null; // exactly one plain paragraph, nothing else
  const text = para[1].replace(/\s+/g, " ").trim();

  const hits: Array<{ label: string; start: number; bodyStart: number }> = [];
  for (const m of text.matchAll(LABEL_RE)) {
    const idx = m.index ?? 0;
    const punct = m[1] && /^[.;!?)]/.test(m[1]) ? 1 : 0;
    hits.push({ label: m[2], start: idx + punct, bodyStart: idx + m[0].length });
  }
  if (hits.length < 2) return null;

  let sourceNote = false;
  const strip = (s: string) => {
    const t = s.trim();
    if (SOURCE_NOTE_RE.test(t)) {
      sourceNote = true;
      return t.replace(SOURCE_NOTE_RE, "").trim();
    }
    return t;
  };

  const out: string[] = [];
  if (facts) out.push(facts[0].trim());
  const intro = strip(text.slice(0, hits[0].start));
  if (intro) out.push(`<p>${intro}</p>`);
  hits.forEach((h, i) => {
    const end = i + 1 < hits.length ? hits[i + 1].start : text.length;
    const body = strip(text.slice(h.bodyStart, end));
    const rendered = renderBody(body);
    if (rendered) out.push(`<h3>${headingOf(h.label)}</h3>${rendered}`);
  });
  // phrased so structureDescription reads it as body text, not as a "Thông tin…" section heading
  if (sourceNote) out.push("<p><em>Theo thông tin công bố của hãng.</em></p>");
  return out.join("\n");
}
