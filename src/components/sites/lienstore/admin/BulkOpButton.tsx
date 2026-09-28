"use client";

import { useEffect, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";
import { ADMIN_BAR_ID } from "./AdminBar";

/** Bulk forms whose id starts with `prefix`, each with how many of its row checkboxes are ticked. */
function ticked(prefix: string): Array<{ form: HTMLFormElement; n: number }> {
  const bar = document.getElementById(ADMIN_BAR_ID);
  return Array.from(document.querySelectorAll<HTMLFormElement>(`form[id^="${prefix}"]`))
    .map((form) => ({ form, n: Array.from(form.elements).filter((el) => el instanceof HTMLInputElement && el.type === "checkbox" && el.checked && !bar?.contains(el)).length }))
    .filter((x) => x.n > 0);
}

/**
 * Bottom-bar button for one bulk operation over several tables at once (e.g. "Xoá sản phẩm" over every purchase
 * trip): disabled until a row is ticked, asks first, then submits each table's bulk form through its hidden
 * `<button data-op={op} form=…>` so the server action gets `op`.
 */
export function BulkOpButton({ prefix, op, label, title, message, confirmLabel, className }: { prefix: string; op: string; label: string; title: string; message: string; confirmLabel: string; className?: string }) {
  const [n, setN] = useState(0);
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    const sync = () => setN(ticked(prefix).reduce((k, x) => k + x.n, 0));
    sync();
    document.addEventListener("change", sync);
    return () => document.removeEventListener("change", sync);
  }, [prefix]);
  const run = () => {
    setAsking(false);
    for (const { form } of ticked(prefix)) {
      const submitter = document.querySelector<HTMLButtonElement>(`button[data-op="${op}"][form="${form.id}"]`);
      if (submitter) form.requestSubmit(submitter);
    }
  };
  return (
    <>
      <button type="button" disabled={n === 0} onClick={() => setAsking(true)} className={className} data-testid={`bulk-op-${op}`}>
        {label}
        {n ? ` (${n})` : ""}
      </button>
      <ConfirmDialog open={asking} title={title} message={message.replace("{n}", String(n))} confirmLabel={confirmLabel} onConfirm={run} onCancel={() => setAsking(false)} />
    </>
  );
}
