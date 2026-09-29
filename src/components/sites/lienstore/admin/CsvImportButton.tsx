"use client";

import { useRef, useState } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";
import { btnPrimary, btnSecondary } from "./ui";

/**
 * One-button CSV import for the bottom bar: "Nhập CSV" opens the file dialog; once a file is chosen the button turns
 * into "OK — nhập <file>" that submits the form (× puts it back). The form posts to `action` with the file as `csv`.
 */
export function CsvImportButton({ action, label = "Nhập CSV", className, title }: { action: (fd: FormData) => Promise<void>; label?: string; className?: string; title?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const clear = () => {
    setName("");
    if (input.current) input.current.value = "";
  };
  return (
    <form action={action} className="flex items-center gap-1" data-testid="csv-import">
      <input ref={input} type="file" name="csv" accept=".csv,text/csv" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => setName(e.target.files?.[0]?.name ?? "")} />
      {name ? (
        <>
          <button type="submit" className={cn(btnPrimary, className)} title={`Nhập file ${name}`} data-testid="csv-import-ok">
            <Fa name="check" /> OK — nhập {name.length > 28 ? `${name.slice(0, 25)}…` : name}
          </button>
          <button type="button" onClick={clear} className={cn(btnSecondary, "!px-2", className)} aria-label="Bỏ file đã chọn" title="Bỏ file đã chọn">
            <Fa name="times" />
          </button>
        </>
      ) : (
        <button type="button" onClick={() => input.current?.click()} className={cn(btnSecondary, className)} title={title} data-testid="csv-import-pick">
          <Fa name="upload" /> {label}
        </button>
      )}
    </form>
  );
}
