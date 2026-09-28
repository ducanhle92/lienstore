"use client";

import type { ReactNode } from "react";

/** A <select> that submits its (GET) form as soon as a value is picked — filters without a separate "Xem" button. */
export function AutoSubmitSelect({ name, defaultValue, className, label, children }: { name: string; defaultValue: string; className?: string; label: string; children: ReactNode }) {
  return (
    <select name={name} defaultValue={defaultValue} className={className} aria-label={label} title={label} onChange={(e) => e.currentTarget.form?.requestSubmit()}>
      {children}
    </select>
  );
}
