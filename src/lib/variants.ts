import type { CatalogProduct, ProductGroup } from "@/types/shop";

/**
 * Product variants ("nhóm biến thể"): several catalogue rows that are the same line in a different flavour, size,
 * count or scent share a `groupId`. Each row keeps its own images, price, SKU and copy; the group only decides
 * (1) that listings show ONE card for the family and (2) that the product page shows a picker to jump between them.
 */

export interface VariantSummary {
  /** Number of published variants in the family (incl. the shown one). */
  count: number;
  minPrice: number;
  maxPrice: number;
}

export const MAX_VARIANT_ATTRS = 3;

/** Attribute labels of a group, cleaned: trimmed, unique, at most MAX_VARIANT_ATTRS. */
export function normalizeAttrLabels(raw: string | string[]): string[] {
  const parts = Array.isArray(raw) ? raw : raw.split(/[,;\n]/);
  const out: string[] = [];
  for (const p of parts) {
    const s = p.trim().replace(/\s+/g, " ").slice(0, 30);
    if (s && !out.some((o) => o.toLowerCase() === s.toLowerCase())) out.push(s);
    if (out.length >= MAX_VARIANT_ATTRS) break;
  }
  return out;
}

export function parseVariantAttrs(raw: string | null | undefined): Record<string, string> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object" || Array.isArray(v)) return {};
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) if (typeof val === "string" && val.trim()) out[k] = val.trim();
    return out;
  } catch {
    return {};
  }
}

const trimPunct = (s: string) => s.replace(/^[\s\-–·,:()]+|[\s\-–·,:()]+$/g, "").trim();

/**
 * The words that differ between sibling names: common leading and trailing words are dropped
 * ("Nama Socola Matcha Nhật Bản" / "Nama Socola Au Lait Nhật Bản" → "Matcha" / "Au Lait").
 */
export function distinctParts(names: string[]): string[] {
  if (names.length < 2) return names.map(trimPunct);
  const words = names.map((n) => n.trim().split(/\s+/));
  const same = (i: number, fromEnd: boolean) => {
    const pick = (w: string[]) => (fromEnd ? w[w.length - 1 - i] : w[i]);
    const first = pick(words[0]);
    return first !== undefined && words.every((w) => pick(w) !== undefined && pick(w).toLowerCase() === first.toLowerCase());
  };
  const minLen = Math.min(...words.map((w) => w.length));
  let head = 0;
  while (head < minLen - 1 && same(head, false)) head++;
  let tail = 0;
  while (head + tail < minLen - 1 && same(tail, true)) tail++;
  const cut = (t: number) => words.map((w) => trimPunct(w.slice(head, w.length - t).join(" ")));
  let parts = cut(tail);
  // keep a shared unit word ("840 viên", "500 ml") when a chip would otherwise be a bare number
  if (tail > 0 && parts.some((s) => /^[\d.,]+$/.test(s))) parts = cut(0);
  return parts.map((s, i) => s || trimPunct(words[i].join(" ")));
}

/** Short label shown on the picker chip: the attribute values in label order, else the part of the name that differs. */
export function variantLabel(p: Pick<CatalogProduct, "name" | "variantAttrs">, labels: string[], groupName?: string, siblingNames?: string[]): string {
  const vals = labels.map((l) => p.variantAttrs[l]).filter((v): v is string => !!v);
  if (vals.length) return vals.join(" · ");
  if (siblingNames && siblingNames.length > 1) {
    const idx = siblingNames.indexOf(p.name);
    if (idx >= 0) return distinctParts(siblingNames)[idx];
  }
  if (groupName) {
    const stripped = trimPunct(p.name.replace(new RegExp(groupName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"), ""));
    if (stripped) return stripped;
  }
  return p.name;
}

/**
 * Collapse every variant family to one representative card (lowest `variantPosition`, then lowest id) and attach
 * the family summary. Products without a group pass through untouched; order of first appearance is kept.
 */
export function collapseVariants<T extends CatalogProduct>(products: T[], groupNames?: Map<number, string>): T[] {
  const firstIndex = new Map<number, number>();
  const rep = new Map<number, T>();
  const summary = new Map<number, VariantSummary & { groupName?: string }>();
  const out: Array<T | null> = [];
  for (const p of products) {
    if (p.groupId === null) {
      out.push(p);
      continue;
    }
    const g = p.groupId;
    const s = summary.get(g);
    if (!s) {
      summary.set(g, { count: 1, minPrice: p.price, maxPrice: p.price, ...(groupNames?.get(g) ? { groupName: groupNames.get(g) } : {}) });
      firstIndex.set(g, out.length);
      rep.set(g, p);
      out.push(null); // placeholder; filled once the representative is known
    } else {
      s.count++;
      s.minPrice = Math.min(s.minPrice, p.price);
      s.maxPrice = Math.max(s.maxPrice, p.price);
      const cur = rep.get(g)!;
      if (p.variantPosition < cur.variantPosition || (p.variantPosition === cur.variantPosition && p.id < cur.id)) rep.set(g, p);
    }
  }
  for (const [g, idx] of firstIndex) out[idx] = { ...rep.get(g)!, variantSummary: summary.get(g)! };
  return out.filter((p): p is T => p !== null);
}

/** Siblings of a product inside its family (published only), sorted for the picker. */
export function sortVariants<T extends CatalogProduct>(list: T[]): T[] {
  return [...list].sort((a, b) => a.variantPosition - b.variantPosition || a.name.localeCompare(b.name, "vi") || a.id - b.id);
}

/** Distinct values of one attribute across the family, in picker order. */
export function attrValues(list: Array<Pick<CatalogProduct, "variantAttrs">>, label: string): string[] {
  const out: string[] = [];
  for (const p of list) {
    const v = p.variantAttrs[label];
    if (v && !out.includes(v)) out.push(v);
  }
  return out;
}

/** Group slug from its name. */
export function groupSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export function emptyGroup(name: string, attrLabels: string[] = []): Omit<ProductGroup, "id" | "createdAt"> {
  return { slug: groupSlug(name), name: name.trim(), attrLabels: normalizeAttrLabels(attrLabels) };
}
