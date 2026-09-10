"use client";

import { useId, useMemo, useState } from "react";
import { structureDescription, type SectionKey } from "@/lib/description";
import { cn } from "@/lib/utils";
import { adminInput, adminLabel } from "./ui";

type Lang = "vi" | "ja";

interface Props {
  /** Form field name of the hidden textarea that carries the composed HTML (e.g. "description"). */
  name: string;
  lang: Lang;
  initialHtml: string;
  productName?: string;
}

const SECTION_ORDER: Exclude<SectionKey, "info" | "other">[] = ["benefits", "ingredients", "usage", "audience", "notes"];

const HEADINGS: Record<Lang, Record<Exclude<SectionKey, "other">, string>> = {
  vi: { info: "Thông tin sản phẩm", benefits: "Công dụng", ingredients: "Thành phần", usage: "Hướng dẫn sử dụng", audience: "Đối tượng sử dụng", notes: "Lưu ý" },
  ja: { info: "商品情報", benefits: "特徴", ingredients: "成分", usage: "使い方", audience: "対象", notes: "ご注意" },
};

/** Canonical fact label (as produced by structureDescription) → label written back in each language. */
const FACT_LABELS: Array<{ key: string; vi: string; ja: string }> = [
  { key: "Thương hiệu", vi: "Thương hiệu", ja: "ブランド" },
  { key: "Xuất xứ", vi: "Xuất xứ", ja: "原産国" },
  { key: "Quy cách", vi: "Quy cách", ja: "内容量" },
  { key: "Nhà sản xuất", vi: "Nhà sản xuất", ja: "メーカー" },
  { key: "Đối tượng", vi: "Đối tượng", ja: "対象" },
  { key: "Hạn sử dụng", vi: "Hạn sử dụng", ja: "賞味期限" },
];

const UI = {
  vi: { structured: "Soạn theo mục", raw: "HTML thô", intro: "Giới thiệu (1–2 đoạn, HTML đơn giản)", facts: "Thông tin nhanh", lines: "Mỗi dòng là một gạch đầu dòng; để trống nếu không có.", other: "Mục khác (HTML)" },
  ja: { structured: "項目ごとに編集", raw: "HTML", intro: "紹介文（HTML）", facts: "基本情報", lines: "1行が1項目になります。ない場合は空欄。", other: "その他（HTML）" },
};

interface Model {
  intro: string;
  facts: Record<string, string>;
  sections: Record<string, string>; // key → one bullet per line
  other: string; // leftover sections kept as HTML
}

function htmlToLines(html: string): string {
  const items = [...html.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => m[1].trim());
  if (items.length) return items.join("\n");
  return html
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(ul|ol|p|div)[^>]*>/gi, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
}

function linesToHtml(text: string): string {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return "";
  return `<ul>${lines.map((l) => `<li>${l}</li>`).join("")}</ul>`;
}

function parse(html: string, name: string): Model {
  const d = structureDescription(html, name);
  const facts: Record<string, string> = {};
  for (const f of d.facts) facts[f.label] = f.value;
  const sections: Record<string, string> = {};
  const other: string[] = [];
  for (const s of d.sections) {
    if (s.key === "other" || s.key === "info") other.push(`<p><strong>${s.title}</strong></p>${s.html}`);
    else sections[s.key] = htmlToLines(s.html);
  }
  return { intro: d.introHtml.trim(), facts, sections, other: other.join("\n") };
}

function compose(m: Model, lang: Lang): string {
  const parts: string[] = [];
  if (m.intro.trim()) parts.push(/^</.test(m.intro.trim()) ? m.intro.trim() : `<p>${m.intro.trim()}</p>`);
  const facts = FACT_LABELS.filter((f) => m.facts[f.key]?.trim()).map((f) => `<li>${f[lang]}: ${m.facts[f.key].trim()}</li>`);
  if (facts.length) parts.push(`<ul>${facts.join("")}</ul>`);
  for (const key of SECTION_ORDER) {
    const body = linesToHtml(m.sections[key] ?? "");
    if (body) parts.push(`<p><strong>${HEADINGS[lang][key]}</strong></p>${body}`);
  }
  if (m.other.trim()) parts.push(m.other.trim());
  return parts.join("");
}

/**
 * Structured editor for a product description: intro, quick facts, one box per topic (Công dụng / Thành phần /
 * Hướng dẫn sử dụng / Đối tượng / Lưu ý) — composed back into the HTML the storefront already understands.
 * A raw-HTML mode is one click away for anything unusual.
 */
export function DescriptionEditor({ name, lang, initialHtml, productName = "" }: Props) {
  const id = useId();
  const ui = UI[lang];
  const initial = useMemo(() => parse(initialHtml, productName), [initialHtml, productName]);
  const [raw, setRaw] = useState(() => !initialHtml.trim() ? false : !structureDescription(initialHtml, productName).structured);
  const [model, setModel] = useState<Model>(initial);
  const [html, setHtml] = useState(initialHtml);

  const update = (patch: Partial<Model>) => {
    const next = { ...model, ...patch };
    setModel(next);
    setHtml(compose(next, lang));
  };
  const switchMode = (toRaw: boolean) => {
    if (!toRaw) setModel(parse(html, productName));
    else setHtml(raw ? html : compose(model, lang));
    setRaw(toRaw);
  };

  const tab = (active: boolean) => cn("rounded-full px-3 py-1 text-[12px] font-semibold", active ? "bg-lien-blue text-white" : "bg-[#eef2ff] text-[#374151] hover:bg-[#e0e7ff]");

  return (
    <div className="rounded-md border border-[#e5e7eb] p-3">
      <div className="mb-3 flex gap-2">
        <button type="button" onClick={() => switchMode(false)} className={tab(!raw)}>
          {ui.structured}
        </button>
        <button type="button" onClick={() => switchMode(true)} className={tab(raw)}>
          {ui.raw}
        </button>
      </div>
      {/* the value the form submits, always in sync */}
      <textarea name={name} value={html} onChange={(e) => setHtml(e.target.value)} rows={12} className={cn(adminInput, "font-mono text-[13px]", !raw && "hidden")} />
      {!raw ? (
        <div className="grid gap-3">
          <div>
            <label className={adminLabel} htmlFor={`${id}-intro`}>
              {ui.intro}
            </label>
            <textarea id={`${id}-intro`} rows={3} value={model.intro} onChange={(e) => update({ intro: e.target.value })} className={adminInput} />
          </div>
          <div>
            <p className={adminLabel}>{ui.facts}</p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {FACT_LABELS.map((f) => (
                <label key={f.key} className="block text-[12px] text-[#6b7280]">
                  {f[lang]}
                  <input value={model.facts[f.key] ?? ""} onChange={(e) => update({ facts: { ...model.facts, [f.key]: e.target.value } })} className={cn(adminInput, "mt-0.5")} />
                </label>
              ))}
            </div>
          </div>
          {SECTION_ORDER.map((key) => (
            <div key={key}>
              <label className={adminLabel} htmlFor={`${id}-${key}`}>
                {HEADINGS[lang][key]} <span className="font-normal text-[#9ca3af]">— {ui.lines}</span>
              </label>
              <textarea id={`${id}-${key}`} rows={key === "benefits" ? 5 : 3} value={model.sections[key] ?? ""} onChange={(e) => update({ sections: { ...model.sections, [key]: e.target.value } })} className={adminInput} />
            </div>
          ))}
          {model.other ? (
            <div>
              <label className={adminLabel} htmlFor={`${id}-other`}>
                {ui.other}
              </label>
              <textarea id={`${id}-other`} rows={3} value={model.other} onChange={(e) => update({ other: e.target.value })} className={cn(adminInput, "font-mono text-[12px]")} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
