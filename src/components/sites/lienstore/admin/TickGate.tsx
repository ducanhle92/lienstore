"use client";

import { useEffect } from "react";

/**
 * Keeps the bulk controls bound to a form (`select[form=…]`, `button[form=…]`) disabled until at least one checkbox of
 * that form is ticked — so "Cập nhật" / "Xoá dòng đã tick" cannot fire on nothing.
 */
export function TickGate({ scope }: { scope: string }) {
  useEffect(() => {
    const apply = () => {
      const any = document.querySelector(`input[type="checkbox"][form="${scope}"]:checked`) !== null;
      for (const el of document.querySelectorAll<HTMLButtonElement | HTMLSelectElement>(`select[form="${scope}"], button[form="${scope}"]`)) el.disabled = !any;
    };
    apply();
    document.addEventListener("change", apply);
    return () => document.removeEventListener("change", apply);
  }, [scope]);
  // marks the form as a bulk form: the bottom bar does not count its options as unsaved edits
  return <span hidden data-tick-scope={scope} />;
}
