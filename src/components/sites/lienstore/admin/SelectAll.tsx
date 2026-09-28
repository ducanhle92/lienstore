"use client";

/** "Chọn tất cả" for the checkboxes inside [data-select-scope=scope]; rows hidden by a filter are skipped. */
export function SelectAll({ scope, label = "chọn tất cả", className }: { scope: string; label?: string; className?: string }) {
  const toggle = (on: boolean) => {
    for (const box of document.querySelectorAll<HTMLInputElement>(`[data-select-scope="${scope}"] input[type="checkbox"]`)) {
      if (box.closest("tr")?.classList.contains("hidden")) continue;
      box.checked = on;
      box.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  return (
    <label className={className ?? "inline-flex items-center gap-1.5 text-[12px]"}>
      <input type="checkbox" onChange={(e) => toggle(e.target.checked)} className="h-4 w-4" aria-label={label || "Chọn tất cả"} title="Chọn tất cả dòng đang hiện" /> {label}
    </label>
  );
}
