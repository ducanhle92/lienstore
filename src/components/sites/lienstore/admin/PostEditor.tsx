"use client";

import { useEffect, useRef, useState } from "react";
import { Fa, type FaName } from "@/components/sites/lienstore/shared/icons";
import { cn } from "@/lib/utils";
import { btnSecondary } from "./ui";

/**
 * WordPress-like editor for blog posts: a contenteditable area with a small toolbar (headings, bold/italic, lists,
 * link, picture upload, HTML view). The HTML lands in a hidden `content` input for the server action.
 */
export function PostEditor({ name = "content", initial = "" }: { name?: string; initial?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [html, setHtml] = useState(initial);
  const [raw, setRaw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (box.current && !raw && box.current.innerHTML !== html) box.current.innerHTML = html;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when switching back from the HTML view
  }, [raw]);

  const sync = () => {
    if (box.current) setHtml(box.current.innerHTML);
  };
  const cmd = (command: string, value?: string) => {
    box.current?.focus();
    document.execCommand(command, false, value);
    sync();
  };
  const heading = (tag: "h2" | "h3" | "p") => cmd("formatBlock", tag);
  const link = () => {
    const url = window.prompt("Đường dẫn (https://… hoặc /product/…):", "https://");
    if (url) cmd("createLink", url);
  };
  const upload = async (f: File) => {
    setBusy(true);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("image", f);
      fd.append("name", f.name);
      fd.append("folder", "posts");
      const r = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const j = (await r.json()) as { image?: string; error?: string };
      if (!r.ok || !j.image) throw new Error(j.error ?? "Không tải được ảnh.");
      box.current?.focus();
      document.execCommand("insertHTML", false, `<figure><img src="${j.image}" alt="" style="max-width:100%;height:auto" /><figcaption></figcaption></figure><p></p>`);
      sync();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Không tải được ảnh.");
    } finally {
      setBusy(false);
      if (file.current) file.current.value = "";
    }
  };
  const tool = (icon: FaName | null, label: string, onClick: () => void, text?: string) => (
    <button key={label} type="button" title={label} onMouseDown={(e) => e.preventDefault()} onClick={onClick} className="inline-flex h-8 min-w-8 items-center justify-center gap-1 rounded border border-[#d1d5db] bg-white px-2 text-[12px] font-semibold text-lien-text hover:border-lien-blue hover:text-lien-blue">
      {icon ? <Fa name={icon} /> : null}
      {text}
    </button>
  );

  return (
    <div className="rounded-md border border-[#d1d5db] bg-white">
      <input type="hidden" name={name} value={html} readOnly />
      <div className="flex flex-wrap items-center gap-1 border-b border-[#e5e7eb] bg-[#f9fafb] p-2">
        {tool(null, "Đoạn văn", () => heading("p"), "¶")}
        {tool(null, "Tiêu đề lớn", () => heading("h2"), "H2")}
        {tool(null, "Tiêu đề nhỏ", () => heading("h3"), "H3")}
        <span className="mx-1 h-6 w-px bg-[#e5e7eb]" />
        {tool(null, "Đậm", () => cmd("bold"), "B")}
        {tool(null, "Nghiêng", () => cmd("italic"), "I")}
        {tool(null, "Gạch chân", () => cmd("underline"), "U")}
        <span className="mx-1 h-6 w-px bg-[#e5e7eb]" />
        {tool("list", "Danh sách", () => cmd("insertUnorderedList"))}
        {tool("align-left", "Danh sách số", () => cmd("insertOrderedList"), "1.")}
        {tool("external-link", "Chèn link", link)}
        {tool("picture-o", busy ? "Đang tải…" : "Chèn ảnh", () => file.current?.click(), busy ? "…" : "Ảnh")}
        {tool("times", "Xoá định dạng", () => cmd("removeFormat"))}
        <span className="ml-auto" />
        <button type="button" onClick={() => { if (raw && box.current) box.current.innerHTML = html; setRaw(!raw); }} className={cn(btnSecondary, "!px-2 !py-1 !text-[12px]", raw && "!border-lien-blue !text-lien-blue")}>
          {raw ? "Soạn thảo" : "HTML"}
        </button>
        <input ref={file} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }} />
      </div>
      {raw ? (
        <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={18} className="block w-full resize-y border-0 p-3 font-mono text-[13px] leading-5 text-lien-text outline-none" spellCheck={false} />
      ) : (
        <div
          ref={box}
          contentEditable
          suppressContentEditableWarning
          onInput={sync}
          onBlur={sync}
          onPaste={(e) => {
            // keep pasted text plain — WordPress/Word HTML brings inline styles the page does not want
            e.preventDefault();
            document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
            sync();
          }}
          className="lien-prose min-h-[360px] p-4 text-[15px] leading-7 outline-none [&_figure]:my-3 [&_h2]:mt-5 [&_h2]:text-[22px] [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:text-[18px] [&_h3]:font-bold [&_img]:max-w-full [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 [&_a]:text-lien-blue [&_a]:underline"
        />
      )}
      {err ? <p className="m-0 border-t border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[12px] text-red-700">{err}</p> : null}
      <p className="m-0 border-t border-[#e5e7eb] px-3 py-1.5 text-[11px] text-lien-muted">Ảnh tải lên được lưu trong thư mục posts của server (JPG/PNG/WebP, tối đa 10 MB). Dán văn bản sẽ bỏ định dạng nguồn.</p>
    </div>
  );
}
