"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrderMessage } from "@/types/shop";

export type ChatState = { error?: string } | null;

/** A bill (receipt) of the order, shown in the admin thread at the time it was attached. */
export interface ChatFile {
  id: number;
  fileName: string;
  url: string;
  mime: string;
  size: string;
  amountJpy: number | null;
  note: string;
  createdAt: string;
}

interface Props {
  orderId: string;
  messages: OrderMessage[];
  /** Who is typing: the customer (storefront) or the shop (admin). */
  me: "customer" | "admin";
  action: (prev: ChatState, formData: FormData) => Promise<ChatState>;
  /** Extra hidden fields for the action (e.g. source=received). */
  hidden?: Record<string, string>;
  /** Quick replies shown above the box (admin: "Đã gửi hàng…"). */
  quickReplies?: string[];
  shopName?: string;
  className?: string;
  /** Poll interval in ms while the tab is visible (0 = off). */
  pollMs?: number;
  /** Admin: the order's bills, shown in the thread, and "Đính kèm bill" in the composer. */
  files?: ChatFile[];
  attach?: boolean;
  /** Admin: server action behind "Xoá" of one bill (gets fileId + orderId). */
  fileDeleteAction?: (formData: FormData) => Promise<void>;
}

/**
 * Mercari-style conversation attached to an order: my messages on the right (blue), the other side on the left (grey).
 * Server-rendered message list + a form posting through a server action; refreshes itself while open.
 */
export function OrderChat({ orderId, messages, me, action, hidden = {}, quickReplies = [], shopName = "shop", className, pollMs = 20000, files = [], attach = false, fileDeleteAction }: Props) {
  const [picked, setPicked] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState<ChatState, FormData>(action, null);
  const router = useRouter();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // keep the newest message in view
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length, files.length]);

  // light polling so replies show up without a manual reload
  useEffect(() => {
    if (!pollMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, pollMs);
    return () => window.clearInterval(id);
  }, [pollMs, router]);

  // the shop always speaks under its public name (older messages stored a fixed brand as sender name)
  const label = (m: OrderMessage) => (m.sender === "admin" ? shopName : m.senderName || "Khách hàng");
  const thread = [...messages.map((m) => ({ at: m.createdAt, m, f: null as ChatFile | null })), ...files.map((f) => ({ at: f.createdAt, m: null as OrderMessage | null, f }))].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <section className={cn("order-chat", className)} aria-label="Trao đổi về đơn hàng">
      <div ref={listRef} className={cn("max-h-[420px] space-y-3 overflow-y-auto rounded-md border border-lien-line bg-white p-3", messages.length === 0 && me === "customer" && "hidden")}>
        {thread.length === 0 ? (
          <p className="m-0 py-6 text-center text-[13px] text-lien-muted">Chưa có tin nhắn với khách về đơn này.</p>
        ) : (
          thread.map(({ m, f }) => {
            if (f) {
              const img = f.mime.startsWith("image/");
              return (
                <div key={`f${f.id}`} className="flex flex-col items-end" data-testid={`chat-file-${f.id}`}>
                  <div className="flex max-w-[85%] items-start gap-3 rounded-2xl rounded-tr-sm border border-lien-blue/30 bg-[#f3f9ff] px-3 py-2 text-[13px]">
                    {img ? (
                      <a href={f.url} target="_blank" rel="noreferrer" className="shrink-0">
                        {/* eslint-disable-next-line @next/next/no-img-element -- private per-order file behind a token */}
                        <img src={f.url} alt={f.fileName} className="h-16 w-16 rounded border border-lien-line object-cover" />
                      </a>
                    ) : (
                      <Fa name="file-pdf-o" className="mt-1 text-[22px] text-lien-blue" />
                    )}
                    <div className="min-w-0">
                      <span className="block text-[11px] font-semibold uppercase tracking-wide text-lien-blue">Bill mua hàng</span>
                      <a href={f.url} target="_blank" rel="noreferrer" className="break-all font-semibold text-lien-heading hover:text-lien-blue">
                        {f.fileName}
                      </a>
                      <span className="block text-[11px] text-lien-muted">
                        {f.size}
                        {f.amountJpy ? ` · ¥${f.amountJpy.toLocaleString("ja-JP")}` : ""}
                        {f.note ? ` · ${f.note}` : ""} · {formatDateTime(f.createdAt)}
                      </span>
                      {fileDeleteAction ? (
                        <form action={fileDeleteAction} className="mt-0.5">
                          <input type="hidden" name="fileId" value={f.id} />
                          <input type="hidden" name="orderId" value={orderId} />
                          <ConfirmSubmit message={`Xoá bill “${f.fileName}”? Khách không còn thấy file này.`} confirmLabel="Xoá" className="text-[11px] text-lien-heart hover:underline">
                            Xoá
                          </ConfirmSubmit>
                        </form>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            }
            if (!m) return null;
            const mine = m.sender === me;
            return (
              <div key={m.id} className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
                {!mine ? (
                  <span className="mb-0.5 flex items-center gap-1.5 text-[12px] font-semibold text-lien-heading">
                    <span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[10px] text-white", m.sender === "admin" ? "bg-lien-blue" : "bg-lien-muted")}>
                      <Fa name={m.sender === "admin" ? "building" : "user"} />
                    </span>
                    {label(m)}
                  </span>
                ) : null}
                <div className={cn("max-w-[85%] rounded-2xl px-3.5 py-2 text-[14px] leading-6 whitespace-pre-wrap break-words", mine ? "rounded-tr-sm bg-[#dbeeff] text-lien-heading" : "rounded-tl-sm bg-[#f1f1f1] text-lien-text")}>
                  {m.body}
                  <span className="mt-1 block text-right text-[11px] text-lien-muted">
                    {formatDateTime(m.createdAt)}
                    {mine && me === "admin" ? (m.readByCustomer ? " · khách đã xem" : "") : null}
                    {mine && me === "customer" ? (m.readByAdmin ? " · shop đã xem" : "") : null}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {quickReplies.length ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <select
            aria-label="Mẫu tin nhắn"
            defaultValue=""
            onChange={(e) => {
              if (textRef.current && e.target.value) {
                textRef.current.value = e.target.value;
                textRef.current.focus();
              }
              e.target.value = "";
            }}
            className="max-w-full rounded-md border border-lien-line bg-white px-2 py-1 text-[12px] text-lien-text"
            data-testid="chat-templates"
          >
            <option value="">Chèn mẫu tin nhắn…</option>
            {quickReplies.map((q) => (
              <option key={q} value={q}>
                {q.length > 90 ? `${q.slice(0, 87)}…` : q}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <form
        ref={formRef}
        action={formAction}
        className="mt-3"
        onSubmit={() => {
          // clear after the action runs (the list re-renders from the server)
          window.setTimeout(() => {
            formRef.current?.reset();
            setPicked([]);
          }, 50);
        }}
      >
        <input type="hidden" name="orderId" value={orderId} />
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        {state?.error ? <p className="m-0 mb-2 text-[13px] text-[#b81c23]">{state.error}</p> : null}
        <textarea
          ref={textRef}
          name="body"
          required={!attach || picked.length === 0}
          maxLength={2000}
          rows={3}
          placeholder={me === "customer" ? `Nhắn cho ${shopName} về đơn này (giờ nhận hàng, đổi địa chỉ, hỏi tiến độ…)` : "Trả lời khách: tiến độ, bill, thay đổi phí…"}
          className="block w-full rounded-md border border-lien-input-border bg-white px-3 py-2 text-[14px] leading-6 text-lien-text outline-none focus:border-lien-blue focus:ring-2 focus:ring-lien-blue/20"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) formRef.current?.requestSubmit();
          }}
        />
        {attach ? (
          <div className="mt-2 grid gap-2">
            <input ref={fileRef} type="file" name="files" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => setPicked(Array.from(e.target.files ?? []).map((f) => f.name))} data-testid="chat-files" />
            {picked.length ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-lien-blue/40 bg-[#f3f9ff] px-2 py-1.5 text-[12px]">
                <Fa name="paperclip" className="text-lien-blue" />
                <span className="min-w-0 flex-1 truncate font-semibold text-lien-heading" title={picked.join(", ")}>
                  {picked.length} file: {picked.join(", ")}
                </span>
                <input name="amountJpy" inputMode="numeric" placeholder="¥ (tuỳ chọn)" className="w-[110px] rounded border border-lien-input-border px-2 py-1 text-[12px]" aria-label="Số tiền bill (JPY)" />
                <input name="fileNote" placeholder="ghi chú bill, vd Amazon JP 08/09" className="w-[200px] max-w-full rounded border border-lien-input-border px-2 py-1 text-[12px]" aria-label="Ghi chú cho bill" />
                <button
                  type="button"
                  onClick={() => {
                    if (fileRef.current) fileRef.current.value = "";
                    setPicked([]);
                  }}
                  className="text-lien-muted hover:text-lien-heart"
                  aria-label="Bỏ file"
                  title="Bỏ file"
                >
                  ✕
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="mt-2 flex items-center justify-between gap-3">
          {attach ? (
            <button type="button" onClick={() => fileRef.current?.click()} className="inline-flex items-center gap-1.5 rounded-md border border-lien-line bg-white px-3 py-1.5 text-[13px] font-semibold text-lien-heading hover:border-lien-blue hover:text-lien-blue" data-testid="chat-attach">
              <Fa name="paperclip" /> Đính kèm bill
            </button>
          ) : (
            <span className="text-[11px] text-lien-muted">Ctrl + Enter để gửi. Tin nhắn được lưu trong đơn hàng.</span>
          )}
          <button type="submit" disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-full bg-lien-blue px-5 text-[13px] font-bold uppercase tracking-[1px] text-white hover:bg-lien-blue-hover disabled:opacity-60">
            <Fa name="comments-o" /> {pending ? "Đang gửi…" : "Gửi tin nhắn"}
          </button>
        </div>
      </form>
    </section>
  );
}
