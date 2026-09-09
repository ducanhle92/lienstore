/**
 * Turns the free-form product description HTML (scraped from WordPress posts / Facebook captions) into a
 * structured shape the product page can render as quick facts + titled sections.
 *
 * Input examples handled:
 *   <p><strong>CÔNG DỤNG</strong></p><p>&#8211; …</p><p>► …</p><p><strong>HƯỚNG DẪN SỬ DỤNG</strong></p>…
 *   <h3>Tên sản phẩm</h3><ul><li>Xuất xứ: Nhật</li><li>Trọng lượng: 25g</li></ul><p>Cách sử dụng</p><p>…</p>
 * Output: facts (Xuất xứ, Nhà sản xuất, Dung tích…), intro blocks, and sections keyed by canonical topic
 * (Công dụng / Thành phần / Hướng dẫn sử dụng / Đối tượng sử dụng / Lưu ý & bảo quản / Thông tin sản phẩm / other).
 * Pure string processing, no DOM — safe to run in Server Components.
 */

export type SectionKey = "benefits" | "ingredients" | "usage" | "audience" | "notes" | "info" | "other";

export interface DescriptionSection {
  key: SectionKey;
  title: string;
  html: string;
}

export interface DescriptionFact {
  label: string;
  value: string;
}

export interface StructuredDescription {
  facts: DescriptionFact[];
  introHtml: string;
  sections: DescriptionSection[];
  /** True when at least one recognised section heading was found. */
  structured: boolean;
}

export const SECTION_TITLES: Record<SectionKey, string> = {
  benefits: "Công dụng",
  ingredients: "Thành phần",
  usage: "Hướng dẫn sử dụng",
  audience: "Đối tượng sử dụng",
  notes: "Lưu ý & bảo quản",
  info: "Thông tin sản phẩm",
  other: "Thông tin thêm",
};

const SECTION_ORDER: SectionKey[] = ["info", "benefits", "ingredients", "usage", "audience", "notes", "other"];

const FACT_LABELS: Array<[RegExp, string]> = [
  [/^(xuat xu|nguon goc|made in)/, "Xuất xứ"],
  [/^(thuong hieu|hang|nhan hieu|brand)/, "Thương hiệu"],
  [/^(nha san xuat|hang san xuat|san xuat boi|nsx)/, "Nhà sản xuất"],
  [/^(trong luong|khoi luong|dung tich|quy cach|dong goi|the tich|kich thuoc)/, "Quy cách"],
  [/^(han su dung|hsd)/, "Hạn sử dụng"],
  [/^(doi tuong)/, "Đối tượng"],
];

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/&#8211;|&#8212;|&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripTags(s: string): string {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function classify(headingText: string): SectionKey {
  const raw = headingText.trim();
  // Japanese headings (content generated from Amazon.co.jp copy)
  if (/^(ご注意|注意|使用上の注意|保存方法|保管|お願い)/.test(raw)) return "notes";
  if (/^(使い方|使用方法|ご使用方法|お召し上がり方|召し上がり方|用法|用量|飲み方|使用量)/.test(raw)) return "usage";
  if (/^(成分|全成分|原材料|配合成分)/.test(raw)) return "ingredients";
  if (/^(対象|こんな方に|おすすめの方)/.test(raw)) return "audience";
  if (/^(特徴|効果|効能|商品の特徴|ポイント|こだわり)/.test(raw)) return "benefits";
  if (/^(商品説明|商品情報|商品について|製品情報|概要)/.test(raw)) return "info";
  const t = fold(headingText);
  if (/^(mot so )?(luu y|bao quan|chong chi dinh|canh bao|khuyen cao|than trong)/.test(t)) return "notes";
  if (/^(huong dan|cach (su )?dung|cach dung|lieu dung|lieu luong|su dung)/.test(t)) return "usage";
  if (/^(thanh phan)/.test(t)) return "ingredients";
  if (/^(doi tuong)/.test(t)) return "audience";
  if (/^(cong dung|tac dung|uu diem|dac diem|loi ich|hieu qua|tinh nang)/.test(t)) return "benefits";
  if (/^(thong tin|xuat xu|quy cach|mo ta san pham|gioi thieu|san pham)/.test(t)) return "info";
  return "other";
}

/** Split flat WordPress-style HTML into top-level blocks. */
function splitBlocks(html: string): string[] {
  const re = /<(h[1-6]|p|ul|ol|table|blockquote|div|figure)\b[^>]*>[\s\S]*?<\/\1>|<hr\s*\/?>/gi;
  const blocks: string[] = [];
  let last = 0;
  for (const m of html.matchAll(re)) {
    const idx = m.index ?? 0;
    const gap = html.slice(last, idx).trim();
    if (gap) blocks.push(`<p>${gap}</p>`);
    blocks.push(m[0]);
    last = idx + m[0].length;
  }
  const tail = html.slice(last).trim();
  if (tail) blocks.push(`<p>${tail}</p>`);
  return blocks.filter((b) => stripTags(b).length > 0 || /<img/i.test(b));
}

const BULLET_RE = /^\s*(?:&#8211;|&#8212;|[–—\-•►▶✔✓☑➤→\*]|\d+[.)])\s*/;

function isHeading(block: string, text: string): boolean {
  if (/^<h[1-6]/i.test(block)) return true;
  if (!/^<p/i.test(block)) return false;
  if (text.length === 0 || text.length > 70) return false;
  if (BULLET_RE.test(text)) return false;
  const inner = block.replace(/^<p[^>]*>/i, "").replace(/<\/p>$/i, "").trim();
  const wrappedStrong = /^<strong>[\s\S]*<\/strong>\s*:?\s*$/i.test(inner.replace(/<br\s*\/?>/gi, ""));
  const letters = text.replace(/[^A-Za-zÀ-ỹ]/g, "");
  const upperRatio = letters ? letters.replace(/[^A-ZÀ-Ỹ]/g, "").length / letters.length : 0;
  const keyword = classify(text) !== "other";
  const endsSentence = /[.!?]$/.test(text) && !/:$/.test(text);
  if (endsSentence && !keyword) return false;
  return wrappedStrong || upperRatio > 0.85 || (keyword && text.length <= 60);
}

/** Merge consecutive "– item" paragraphs into a <ul>. */
function normaliseBullets(blocks: string[]): string[] {
  const out: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) out.push(`<ul>${list.map((li) => `<li>${li}</li>`).join("")}</ul>`);
    list = [];
  };
  for (const b of blocks) {
    const text = stripTags(b);
    if (/^<p/i.test(b) && BULLET_RE.test(text) && text.replace(BULLET_RE, "").length > 0) {
      const inner = b
        .replace(/^<p[^>]*>/i, "")
        .replace(/<\/p>$/i, "")
        .replace(/^\s*(?:&#8211;|&#8212;|[–—\-•►▶✔✓☑➤→\*]|\d+[.)])\s*/, "")
        .trim();
      list.push(inner);
    } else {
      flush();
      out.push(b);
    }
  }
  flush();
  return out;
}

/** Pull "Label: value" facts out of <li> / short <p> blocks; returns remaining blocks. */
function extractFacts(blocks: string[], facts: DescriptionFact[]): string[] {
  const remaining: string[] = [];
  for (const b of blocks) {
    if (/^<ul/i.test(b)) {
      const items = [...b.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1]);
      const keep: string[] = [];
      for (const li of items) {
        const text = stripTags(li);
        const m = text.match(/^([^:]{2,30}):\s*(.{1,80})$/);
        const label = m ? FACT_LABELS.find(([re]) => re.test(fold(m[1])))?.[1] : undefined;
        if (m && label && !facts.some((f) => f.label === label)) facts.push({ label, value: m[2].trim() });
        else keep.push(li);
      }
      if (keep.length) remaining.push(`<ul>${keep.map((li) => `<li>${li}</li>`).join("")}</ul>`);
    } else if (/^<p/i.test(b)) {
      const text = stripTags(b);
      const m = text.match(/^([^:]{2,30}):\s*(.{1,80})$/);
      const label = m ? FACT_LABELS.find(([re]) => re.test(fold(m[1])))?.[1] : undefined;
      if (m && label && !facts.some((f) => f.label === label)) facts.push({ label, value: m[2].trim() });
      else remaining.push(b);
    } else {
      remaining.push(b);
    }
  }
  return remaining;
}

export function structureDescription(html: string, productName = ""): StructuredDescription {
  const facts: DescriptionFact[] = [];
  const blocks = splitBlocks(html || "");

  // Drop a leading heading/paragraph that merely repeats the product name.
  const nameKey = fold(productName);
  while (blocks.length && nameKey && fold(stripTags(blocks[0])).replace(/[^a-z0-9 ]/g, "") === nameKey.replace(/[^a-z0-9 ]/g, "")) blocks.shift();

  const intro: string[] = [];
  const raw: Array<{ key: SectionKey; title: string; blocks: string[] }> = [];
  let current: { key: SectionKey; title: string; blocks: string[] } | null = null;

  for (const b of blocks) {
    const text = stripTags(b).replace(/:$/, "").trim();
    if (isHeading(b, text)) {
      const key = classify(text);
      // Pretty title: canonical for known topics, original text (sentence case) otherwise.
      const title = key === "other" ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : SECTION_TITLES[key];
      current = { key, title: key === "other" ? title : SECTION_TITLES[key], blocks: [] };
      raw.push(current);
      continue;
    }
    (current ? current.blocks : intro).push(b);
  }

  const introBlocks = extractFacts(normaliseBullets(intro), facts);
  const sections: DescriptionSection[] = [];
  for (const s of raw) {
    const body = extractFacts(normaliseBullets(s.blocks), facts);
    if (body.length === 0) continue;
    const existing = sections.find((x) => x.key === s.key && s.key !== "other");
    if (existing) existing.html += body.join("\n");
    else sections.push({ key: s.key, title: s.title, html: body.join("\n") });
  }
  sections.sort((a, b) => SECTION_ORDER.indexOf(a.key) - SECTION_ORDER.indexOf(b.key));

  return {
    facts,
    introHtml: introBlocks.join("\n"),
    sections,
    structured: sections.some((s) => s.key !== "other") || facts.length > 0,
  };
}
