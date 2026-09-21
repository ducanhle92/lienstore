"use client";

import { useMemo, useState } from "react";
import { adminInput } from "./ui";

export interface PickableGroup {
  id: number;
  name: string;
  attrLabels: string[];
}

const strip = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d");

/**
 * Type-ahead picker for the variant family of a product: type part of the family name, pick from the matches,
 * or choose "Sản phẩm độc lập" / "Tạo nhóm mới". `value` is "" (standalone), a group id or "new" — same contract
 * as the old <select>, so the surrounding form logic is untouched.
 */
export function GroupSearchSelect({ groups, value, onChange, name = "groupId" }: { groups: PickableGroup[]; value: string; onChange: (v: string) => void; name?: string }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const selected = groups.find((g) => String(g.id) === value) ?? null;
  const matches = useMemo(() => {
    const terms = strip(q).split(/\s+/).filter(Boolean);
    const list = terms.length ? groups.filter((g) => terms.every((t) => strip(`${g.name} ${g.attrLabels.join(" ")}`).includes(t))) : groups;
    return list.slice(0, 40);
  }, [q, groups]);
  const label = value === "new" ? "+ Tạo nhóm mới…" : selected ? `${selected.name}${selected.attrLabels.length ? ` (${selected.attrLabels.join(", ")})` : ""}` : "— Sản phẩm độc lập —";
  const pick = (v: string) => {
    onChange(v);
    setQ("");
    setOpen(false);
  };
  return (
    <div className="relative" data-testid="group-search">
      <input type="hidden" name={name} value={value} />
      {open ? (
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setOpen(false);
            if (e.key === "Enter") {
              e.preventDefault();
              if (matches[0]) pick(String(matches[0].id));
            }
          }}
          placeholder={`Gõ tên nhóm (${groups.length} nhóm)…`}
          className={`${adminInput} !mb-0`}
          aria-label="Tìm nhóm biến thể"
          autoComplete="off"
        />
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={`${adminInput} flex items-center justify-between text-left`} aria-haspopup="listbox" aria-expanded={false}>
          <span className={value ? "font-semibold text-lien-heading" : "text-lien-text"}>{label}</span>
          <span className="text-[12px] text-lien-muted">Đổi ▾</span>
        </button>
      )}
      {open ? (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-md border border-[#e5e7eb] bg-white p-1 shadow-lg" role="listbox">
          <li>
            <button type="button" onClick={() => pick("")} className={`block w-full rounded px-2 py-1.5 text-left text-[13px] hover:bg-lien-blue-soft ${value === "" ? "font-semibold text-lien-blue" : "text-lien-text"}`}>
              — Sản phẩm độc lập —
            </button>
          </li>
          {matches.map((g) => (
            <li key={g.id}>
              <button type="button" onClick={() => pick(String(g.id))} className={`block w-full rounded px-2 py-1.5 text-left text-[13px] hover:bg-lien-blue-soft ${String(g.id) === value ? "font-semibold text-lien-blue" : "text-lien-text"}`}>
                {g.name}
                {g.attrLabels.length ? <span className="text-lien-muted"> ({g.attrLabels.join(", ")})</span> : null}
              </button>
            </li>
          ))}
          {!matches.length ? <li className="px-2 py-1.5 text-[13px] text-lien-muted">Không có nhóm khớp “{q}”.</li> : null}
          <li className="mt-1 border-t border-[#f0f0f0] pt-1">
            <button type="button" onClick={() => pick("new")} className="block w-full rounded px-2 py-1.5 text-left text-[13px] font-semibold text-lien-blue hover:bg-lien-blue-soft">
              + Tạo nhóm mới…
            </button>
          </li>
        </ul>
      ) : null}
    </div>
  );
}
