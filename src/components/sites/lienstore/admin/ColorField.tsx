"use client";

import { useState } from "react";
import { adminInput } from "./ui";

/** Colour swatch + hex text kept in sync; only the text input is submitted (name). */
export function ColorField({ name, label, defaultValue }: { name: string; label: string; defaultValue: string }) {
  const [value, setValue] = useState(defaultValue);
  const valid = /^#[0-9a-fA-F]{6}$/.test(value);
  return (
    <label className="flex items-center gap-2 text-[13px] text-[#374151]">
      <input type="color" value={valid ? value : "#000000"} onChange={(e) => setValue(e.target.value)} aria-label={`Chọn ${label}`} className="h-9 w-10 cursor-pointer rounded border border-[#d1d5db] bg-white p-0.5" />
      <span className="flex-1">
        <span className="block font-semibold">{label}</span>
        <input name={name} value={value} onChange={(e) => setValue(e.target.value.trim())} pattern="#?[0-9a-fA-F]{6}" className={`${adminInput} mt-0.5 !w-[120px] font-mono !text-[12px]`} aria-label={`Mã màu ${label}`} />
      </span>
    </label>
  );
}
