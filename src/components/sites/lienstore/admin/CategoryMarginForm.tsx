"use client";

import { useState } from "react";
import { deleteCategoryMarginAction, saveCategoryMarginAction } from "@/app/admin/products/pricing/actions";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { adminInput, adminLabel, btnPrimary } from "./ui";

interface Cat {
  slug: string;
  name: string;
  parentSlug: string | null;
}

/**
 * Công thức giá › "Tỉ lệ lãi kỳ vọng theo danh mục": pick a category (and optionally a sub-category), type the margin,
 * save. A product uses: its own margin → its sub-category's → its parent category's → the shop default.
 */
export function CategoryMarginForm({ categories, overrides, defaultPct }: { categories: Cat[]; overrides: Record<string, number>; defaultPct: number }) {
  const parents = categories.filter((c) => !c.parentSlug).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  const [parent, setParent] = useState("");
  const [child, setChild] = useState("");
  const children = categories.filter((c) => c.parentSlug === parent).sort((a, b) => a.name.localeCompare(b.name, "vi"));
  const nameOf = (slug: string) => categories.find((c) => c.slug === slug)?.name ?? slug;
  const target = child || parent;
  const rows = Object.entries(overrides)
    .map(([slug, pct]) => ({ slug, pct, cat: categories.find((c) => c.slug === slug) }))
    .sort((a, b) => nameOf(a.cat?.parentSlug ?? a.slug).localeCompare(nameOf(b.cat?.parentSlug ?? b.slug), "vi") || nameOf(a.slug).localeCompare(nameOf(b.slug), "vi"));
  return (
    <div className="space-y-4">
      <form action={saveCategoryMarginAction} className="grid gap-3 sm:grid-cols-[1fr_1fr_140px_auto] sm:items-end">
        <div>
          <label className={adminLabel} htmlFor="cm-parent">
            Danh mục
          </label>
          <select
            id="cm-parent"
            name="category"
            value={parent}
            onChange={(e) => {
              setParent(e.target.value);
              setChild("");
            }}
            className={adminInput}
            required
          >
            <option value="">— Chọn danh mục —</option>
            <option value="__all__">Tất cả sản phẩm (mặc định của shop)</option>
            {parents.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={adminLabel} htmlFor="cm-child">
            Danh mục con <span className="font-normal text-lien-muted">(để trống = cả danh mục)</span>
          </label>
          <select id="cm-child" name="subcategory" value={child} onChange={(e) => setChild(e.target.value)} disabled={!parent || parent === "__all__" || children.length === 0} className={adminInput}>
            <option value="">{parent === "__all__" ? "— Áp cho mọi danh mục —" : parent && children.length === 0 ? "— Không có danh mục con —" : "— Cả danh mục —"}</option>
            {children.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={adminLabel} htmlFor="cm-pct">
            Tỉ lệ lãi kỳ vọng (%)
          </label>
          <input id="cm-pct" name="pct" inputMode="decimal" defaultValue={target === "__all__" ? defaultPct : target && overrides[target] !== undefined ? overrides[target] : ""} key={target} placeholder={String(defaultPct)} className={adminInput} required />
        </div>
        <button type="submit" disabled={!parent} className={`${btnPrimary} disabled:opacity-50`}>
          <Fa name="check" /> Lưu
        </button>
      </form>
      {rows.length || true ? (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-[#f9fafb] text-left text-[11px] font-bold uppercase tracking-wide text-lien-muted">
              <th className="border-b border-[#e5e7eb] px-2 py-2">Danh mục</th>
              <th className="border-b border-[#e5e7eb] px-2 py-2">Danh mục con</th>
              <th className="border-b border-[#e5e7eb] px-2 py-2 text-right">Tỉ lệ lãi kỳ vọng</th>
              <th className="border-b border-[#e5e7eb] px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            <tr data-testid="cm-row-all">
              <td className="border-b border-[#f3f4f6] px-2 py-1.5 font-semibold text-lien-heading">Tất cả sản phẩm</td>
              <td className="border-b border-[#f3f4f6] px-2 py-1.5 text-lien-muted">mặc định của shop</td>
              <td className="border-b border-[#f3f4f6] px-2 py-1.5 text-right font-semibold" data-testid="cm-default-pct">{defaultPct}%</td>
              <td className="border-b border-[#f3f4f6] px-2 py-1.5" />
            </tr>
            {rows.map((r) => (
              <tr key={r.slug} data-testid={`cm-row-${r.slug}`}>
                <td className="border-b border-[#f3f4f6] px-2 py-1.5 font-semibold text-lien-heading">{r.cat?.parentSlug ? nameOf(r.cat.parentSlug) : nameOf(r.slug)}</td>
                <td className="border-b border-[#f3f4f6] px-2 py-1.5">{r.cat?.parentSlug ? nameOf(r.slug) : <span className="text-lien-muted">cả danh mục</span>}</td>
                <td className="border-b border-[#f3f4f6] px-2 py-1.5 text-right font-semibold">{r.pct}%</td>
                <td className="border-b border-[#f3f4f6] px-2 py-1.5 text-right">
                  <form action={deleteCategoryMarginAction}>
                    <input type="hidden" name="slug" value={r.slug} />
                    <button type="submit" className="text-[12px] text-red-600 hover:underline" title="Bỏ, dùng lại mặc định">
                      <Fa name="close" /> Bỏ
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      <p className="m-0 text-[12px] leading-5 text-lien-muted">Thứ tự áp dụng: tỉ lệ riêng của sản phẩm → danh mục con → danh mục cha → mặc định của shop.</p>
    </div>
  );
}
