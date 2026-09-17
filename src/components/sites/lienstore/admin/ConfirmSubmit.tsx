"use client";

import type { ReactNode } from "react";

interface ConfirmSubmitProps {
  message: string;
  className?: string;
  children: ReactNode;
  /** id of the form to submit when the button sits outside it (or inside another form). */
  form?: string;
}

/** Submit button that asks for confirmation before submitting its form. */
export function ConfirmSubmit({ message, className, children, form }: ConfirmSubmitProps) {
  return (
    <button
      type="submit"
      form={form}
      className={className}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
