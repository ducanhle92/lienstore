"use client";

import { useId, useState } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";
import { btnSecondary } from "./ui";

interface Props {
  name: string;
  accept?: string;
  multiple?: boolean;
  /** Button label, e.g. "Chọn ảnh từ máy". */
  label?: string;
  className?: string;
}

/** A real button in front of the native file input, showing the chosen file name(s). */
export function FilePicker({ name, accept, multiple = false, label = "Chọn tệp", className }: Props) {
  const id = useId();
  const [names, setNames] = useState<string[]>([]);
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <label htmlFor={id} className={cn(btnSecondary, "cursor-pointer")}>
        <Fa name="upload" /> {label}
      </label>
      <input
        id={id}
        type="file"
        name={name}
        accept={accept}
        multiple={multiple}
        className="sr-only"
        onChange={(e) => setNames(Array.from(e.target.files ?? []).map((f) => f.name))}
      />
      <span className="text-[13px] text-lien-muted">{names.length ? names.join(", ") : "Chưa chọn tệp nào"}</span>
    </div>
  );
}
