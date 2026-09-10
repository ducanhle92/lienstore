"use client";

import { useState, type InputHTMLAttributes } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { useLang } from "@/components/sites/lienstore/shared/LangProvider";
import { cn } from "@/lib/utils";

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & { className?: string };

/** Password field with an eye button that toggles between hidden and plain text. */
export function PasswordInput({ className, ...rest }: Props) {
  const [show, setShow] = useState(false);
  const { t } = useLang();
  return (
    <span className="relative block">
      <input {...rest} type={show ? "text" : "password"} className={cn(className, "pr-11")} />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? t("hidePassword") : t("showPassword")}
        aria-pressed={show}
        className="absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full text-[16px] text-lien-muted hover:text-lien-heading"
      >
        <Fa name={show ? "eye-slash" : "eye"} />
      </button>
    </span>
  );
}
