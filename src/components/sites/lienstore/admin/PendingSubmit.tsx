"use client";

import { type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";

/**
 * Submit button that shows a spinner + `pendingLabel` while its form's server action runs (and blocks a second click).
 * Must sit inside the <form> it submits.
 */
export function PendingSubmit({ children, pendingLabel = "Đang xử lý…", className, title, testId }: { children: ReactNode; pendingLabel?: string; className?: string; title?: string; testId?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={cn(className, pending && "cursor-wait opacity-70")} title={title} data-testid={testId}>
      {pending ? (
        <>
          <Fa name="refresh" className="animate-spin" /> {pendingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
