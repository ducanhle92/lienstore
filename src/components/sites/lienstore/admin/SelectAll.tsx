"use client";

/** "Chọn tất cả" for the checkboxes inside [data-select-scope=scope] (a table of candidates). */
export function SelectAll({ scope, label = "chọn tất cả" }: { scope: string; label?: string }) {
  const toggle = (on: boolean) => {
    for (const box of document.querySelectorAll<HTMLInputElement>(`[data-select-scope="${scope}"] input[type="checkbox"]`)) {
      box.checked = on;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  return (
    <label className="inline-flex items-center gap-1.5 text-[12px]">
      <input type="checkbox" onChange={(e) => toggle(e.target.checked)} className="h-4 w-4" aria-label={label} /> {label}
    </label>
  );
}
