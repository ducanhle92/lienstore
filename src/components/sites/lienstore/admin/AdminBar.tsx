"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";
import { btnPrimary, btnSecondary } from "./ui";

export const ADMIN_BAR_ID = "admin-bar";
export const BAR_TOOLS_ID = "admin-bar-tools";
/** Tools that come first, left of "Lưu thay đổi" (e.g. "+ Mở đợt mua mới"). */
export const BAR_LEAD_ID = "admin-bar-lead";
/** Tools pinned to the right edge of the bar (exports, links out). */
export const BAR_END_ID = "admin-bar-end";
export const BAR_BULK_ID = "admin-bar-bulk";
/** Fired once the bar is on the page, so screens that hydrated before it can move their tools in. */
export const BAR_READY_EVENT = "admin-bar:ready";
/** True once the bar has hydrated — before that, nothing may be portalled into its slots (hydration would fail). */
export const barState = { ready: false };

type Control = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const SKIP_TYPES = new Set(["hidden", "submit", "button", "reset", "image"]);

/** A row checkbox of a table with a "chọn tất cả" header — picks rows, it is not an edit. */
const isRowPick = (el: Control) => el instanceof HTMLInputElement && el.type === "checkbox" && !!el.closest("tbody") && !!el.closest("table")?.querySelector("thead input[type=checkbox]");

/**
 * A form posting to a server action. Server-rendered it has method="post"; once React re-renders it on the client the
 * method goes and the action becomes "javascript:…". GET forms (filters, search) are neither.
 */
const isActionForm = (f: HTMLFormElement) => f.getAttribute("method")?.toLowerCase() === "post" || (f.getAttribute("action") ?? "").startsWith("javascript:");

/** Compared with what the server rendered (defaultValue / defaultChecked / defaultSelected), so a save that re-renders clears it. */
function isDirty(el: Control): boolean {
  if (el instanceof HTMLSelectElement) {
    const opts = Array.from(el.options);
    if (!opts.some((o) => o.defaultSelected)) return el.multiple ? opts.some((o) => o.selected) : el.selectedIndex > 0;
    return opts.some((o) => o.selected !== o.defaultSelected);
  }
  if (el instanceof HTMLInputElement) {
    if (el.type === "checkbox" || el.type === "radio") return el.checked !== el.defaultChecked;
    if (el.type === "file") return (el.files?.length ?? 0) > 0;
  }
  return el.value !== el.defaultValue;
}

interface Scan {
  /** forms with something editable on this screen */
  editable: number;
  /** form → changed fields */
  dirty: Map<HTMLFormElement, number>;
}

/**
 * Forms this bar saves: every POST form of the page (server actions) with a named field — except bulk forms
 * (`[data-tick-scope]`, their fields are options of the ticked-row actions), row checkboxes, and anything marked
 * `data-savebar="off"` (forms with their own bar, e.g. the product form).
 */
function scan(): Scan {
  // options of ticked-row actions are not edits; a screen's own tools in the bar (e.g. the order status) are
  const bulk = document.getElementById(BAR_BULK_ID);
  const scopes = new Set(Array.from(document.querySelectorAll<HTMLElement>("[data-tick-scope]")).map((e) => e.dataset.tickScope ?? ""));
  const editable = new Set<HTMLFormElement>();
  const dirty = new Map<HTMLFormElement, number>();
  for (const el of document.querySelectorAll<Control>("main input[name], main select[name], main textarea[name]")) {
    if (bulk?.contains(el) || el.disabled) continue;
    if (el instanceof HTMLInputElement && (SKIP_TYPES.has(el.type) || el.readOnly)) continue;
    const form = el.form;
    if (!form || !isActionForm(form) || scopes.has(form.id)) continue;
    if (form.closest("[data-savebar='off']") || el.closest("[data-savebar='off']") || isRowPick(el)) continue;
    editable.add(form);
    if (isDirty(el)) dirty.set(form, (dirty.get(form) ?? 0) + 1);
  }
  return { editable: editable.size, dirty };
}

/**
 * The one bar fixed to the bottom of every admin screen (like the product page):
 * "Lưu thay đổi" saves every form that was edited, "Huỷ" puts them back; screens add their own tools
 * (<BarTools>) and the actions for ticked rows (<BulkBar>, shown only while something is ticked).
 */
export function AdminBar() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const [state, setState] = useState<{ editable: number; changed: number; forms: number }>({ editable: 0, changed: 0, forms: 0 });
  const [slots, setSlots] = useState({ lead: false, tools: false, bulk: false, end: false });
  // the URL a save started on: the redirect after the save lands on a new URL, which ends "Đang lưu…"
  const [savingAt, setSavingAt] = useState<string | null>(null);
  const saving = savingAt === `${pathname}?${search}`;
  const last = useRef<HTMLFormElement | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(64);

  const recount = useCallback(() => {
    const s = scan();
    const changed = Array.from(s.dirty.values()).reduce((n, v) => n + v, 0);
    setState((p) => (p.editable === s.editable && p.changed === changed && p.forms === s.dirty.size ? p : { editable: s.editable, changed, forms: s.dirty.size }));
    const lead = !!document.getElementById(BAR_LEAD_ID)?.childElementCount;
    const tools = !!document.getElementById(BAR_TOOLS_ID)?.childElementCount;
    const bulk = !!document.getElementById(BAR_BULK_ID)?.childElementCount;
    const end = !!document.getElementById(BAR_END_ID)?.childElementCount;
    setSlots((p) => (p.lead === lead && p.tools === tools && p.bulk === bulk && p.end === end ? p : { lead, tools, bulk, end }));
  }, []);

  useEffect(() => {
    let frame = 0;
    const later = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(recount);
    };
    const onEdit = (e: Event) => {
      const t = e.target as Control | null;
      if (t && "form" in t && t.form) last.current = t.form;
      later();
    };
    barState.ready = true;
    window.dispatchEvent(new Event(BAR_READY_EVENT));
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    document.addEventListener("reset", later, true);
    const mo = new MutationObserver(later);
    const main = document.querySelector("main");
    if (main) mo.observe(main, { childList: true, subtree: true });
    const bar = document.getElementById(ADMIN_BAR_ID);
    if (bar) mo.observe(bar, { childList: true, subtree: true });
    later();
    return () => {
      barState.ready = false;
      cancelAnimationFrame(frame);
      mo.disconnect();
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
      document.removeEventListener("reset", later, true);
    };
  }, [recount]);

  // a save redirects back with ?saved= — the new page is the new baseline
  useEffect(() => {
    last.current = null;
    requestAnimationFrame(recount);
  }, [pathname, search, recount]);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const save = () => {
    const forms = Array.from(scan().dirty.keys());
    if (!forms.length) return;
    // the block edited last goes last, so its message is the one shown after the redirects
    forms.sort((a, b) => (a === last.current ? 1 : b === last.current ? -1 : 0));
    const bad = forms.find((f) => !f.checkValidity());
    if (bad) {
      bad.reportValidity();
      return;
    }
    setSavingAt(`${pathname}?${search}`);
    for (const f of forms) f.requestSubmit();
    window.setTimeout(() => setSavingAt(null), 15000);
  };
  const reset = () => {
    for (const f of scan().dirty.keys()) f.reset();
    requestAnimationFrame(recount);
  };

  const shown = state.editable > 0 || slots.lead || slots.tools || slots.bulk;
  // toasts (FlashToast) sit above the bar instead of on top of its buttons
  useEffect(() => {
    document.documentElement.style.setProperty("--admin-bar-h", shown ? `${height}px` : "0px");
    return () => {
      document.documentElement.style.removeProperty("--admin-bar-h");
    };
  }, [shown, height]);
  return (
    <>
      {shown ? <div style={{ height: height + 8 }} aria-hidden /> : null}
      <div
        id={ADMIN_BAR_ID}
        ref={barRef}
        className={cn("fixed inset-x-0 bottom-0 z-30 border-t border-[#e5e7eb] bg-white/95 shadow-[0_-6px_16px_-10px_rgba(0,0,0,0.35)] backdrop-blur md:left-60", !shown && "hidden")}
        data-testid="admin-bar"
        data-dirty={state.changed}
      >
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-2 px-4 py-2.5 xl:max-w-[1400px] 2xl:max-w-[1600px]">
          <div id={BAR_LEAD_ID} className={slots.lead ? "contents" : "hidden"} />
          {slots.lead && state.editable > 0 ? <span className="mx-1 h-6 w-px self-center bg-[#e5e7eb]" aria-hidden /> : null}
          {state.editable > 0 ? (
            <>
              <button type="button" onClick={save} disabled={!state.changed || saving} className={cn(btnPrimary, "!px-5 !py-2 !text-[14px] disabled:opacity-50")} data-testid="bar-save">
                <Fa name="check" /> {saving ? "Đang lưu…" : "Lưu thay đổi"}
                {state.changed && !saving ? ` (${state.changed} ô)` : ""}
              </button>
              <button type="button" onClick={reset} disabled={!state.changed || saving} className={cn(btnSecondary, "disabled:opacity-50")} data-testid="bar-reset">
                Huỷ
              </button>
              {state.forms > 1 ? <span className="text-[12px] text-lien-muted">{state.forms} khối</span> : null}
            </>
          ) : null}
          {slots.tools && state.editable > 0 ? <span className="mx-1 h-6 w-px self-center bg-[#e5e7eb]" aria-hidden /> : null}
          {/* display:contents — the screen's tools wrap along with Lưu / Huỷ instead of as one block */}
          <div id={BAR_TOOLS_ID} className={slots.tools ? "contents" : "hidden"} />
          <div id={BAR_BULK_ID} className={cn("flex flex-wrap items-center gap-2", !slots.bulk && "hidden")} />
          <div id={BAR_END_ID} className={cn("ml-auto flex flex-wrap items-center gap-2", !slots.end && "hidden")} />
        </div>
      </div>
    </>
  );
}
