"use client";

import { type ReactNode, useRef, useState } from "react";
import { ConfirmDialog } from "./ConfirmDialog";

interface ConfirmSubmitProps {
  message: string;
  title?: string;
  details?: string[];
  confirmLabel?: string;
  className?: string;
  children: ReactNode;
  /** id of the form to submit when the button sits outside it (or inside another form). */
  form?: string;
}

/** Submit button that opens a styled confirmation dialog before submitting its form. */
export function ConfirmSubmit({ message, title, details, confirmLabel, className, children, form }: ConfirmSubmitProps) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={btn}
        type="submit"
        form={form}
        className={className}
        onClick={(e) => {
          e.preventDefault();
          setOpen(true);
        }}
      >
        {children}
      </button>
      <ConfirmDialog
        open={open}
        title={title}
        message={message}
        details={details}
        confirmLabel={confirmLabel}
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          const f = btn.current?.form ?? (form ? (document.getElementById(form) as HTMLFormElement | null) : null);
          f?.requestSubmit();
        }}
      />
    </>
  );
}
