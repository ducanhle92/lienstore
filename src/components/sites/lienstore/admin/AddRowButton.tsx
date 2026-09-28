"use client";

/**
 * Bottom-bar button that opens the "add a row" block (<details data-add-form=…> / [data-add-row]) of the block on
 * screen (or the first one), scrolls to it and focuses its first field.
 */
export function AddRowButton({ label, className }: { label: string; className?: string }) {
  const open = () => {
    const all = Array.from(document.querySelectorAll<HTMLElement>("[data-add-form], [data-add-row]"));
    const shown = (el: HTMLElement) => {
      const box = (el.closest("[data-testid^='batch-']") ?? el.parentElement ?? el).getBoundingClientRect();
      return Math.max(0, Math.min(box.bottom, window.innerHeight - 64) - Math.max(box.top, 0));
    };
    const d = all.map((el) => ({ el, px: shown(el) })).filter((x) => x.px > 0).sort((a, b) => b.px - a.px)[0]?.el ?? all[0];
    if (!d) return;
    if (d instanceof HTMLDetailsElement) d.open = true;
    else d.classList.remove("hidden");
    d.scrollIntoView({ block: "center", behavior: "smooth" });
    window.setTimeout(() => d.querySelector<HTMLInputElement>("input:not([type=hidden])")?.focus(), 250);
  };
  return (
    <button type="button" onClick={open} className={className} data-testid="fixed-add">
      {label}
    </button>
  );
}
