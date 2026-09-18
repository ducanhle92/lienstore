"use client";

import { useId, useState } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";

/** A real button that opens the file dialog (the native file input is hidden) and shows the chosen file name. */
export function FilePickButton({ name, accept, label = "Chọn ảnh", className, multiple = false }: { name: string; accept?: string; label?: string; className: string; multiple?: boolean }) {
  const id = useId();
  const [names, setNames] = useState<string[]>([]);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        id={id}
        name={name}
        type="file"
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => setNames(Array.from(e.target.files ?? []).map((f) => f.name))}
      />
      <label htmlFor={id} className={`${className} cursor-pointer`}>
        <Fa name="upload" /> {label}
      </label>
      <span className="text-[12px] text-lien-muted" data-testid="file-pick-names">
        {names.length ? names.join(", ") : "Chưa chọn tệp"}
      </span>
    </span>
  );
}
