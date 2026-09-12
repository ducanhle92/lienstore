"use client";

import { useState } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";

/** Small "copy to clipboard" button next to bank details (account number, amount, memo). */
export function CopyButton({ value, label = "Sao chép" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          window.setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="ml-2 inline-flex items-center gap-1 rounded border border-lien-line bg-white px-1.5 py-0.5 text-[11px] font-semibold text-lien-muted hover:border-lien-blue hover:text-lien-blue"
      title={label}
      aria-label={`${label} ${value}`}
    >
      <Fa name={done ? "check" : "file-text-o"} /> {done ? "Đã chép" : label}
    </button>
  );
}
