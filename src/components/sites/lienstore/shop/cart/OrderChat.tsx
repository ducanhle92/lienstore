"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { OrderMessage } from "@/types/shop";

export type ChatState = { error?: string } | null;

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
}

/**
 * Mercari-style conversation attached to an order: my messages on the right (blue), the other side on the left (grey).
 * Server-rendered message list + a form posting through a server action; refreshes itself while open.
 */
export function OrderChat({ orderId, messages, me, action, hidden = {}, quickReplies = [], shopName = "LienStore", className, pollMs = 20000 }: Props) {
  const [state, formAction, pending] = useActionState<ChatState, FormData>(action, null);
  const router = useRouter();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // keep the newest message in view
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages.length]);

  // light polling so replies show up without a manual reload
  useEffect(() => {
    if (!pollMs) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, pollMs);
    return () => window.clearInterval(id);
  }, [pollMs, router]);

  const label = (m: OrderMessage) => (m.sender === "admin" ? m.senderName || shopName : m.senderName || "Khách hàng");

  return (
    <section className={cn("order-chat", className)} aria-label="Trao đổi về đơn hàng">
      <div ref={listRef} className={cn("max-h-[420px] space-y-3 overflow-y-auto rounded-md border border-lien-line bg-white p-3", messages.length === 0 && me === "customer" && "hidden")}>
        {messages.length === 0 ? (
          <p className="m-0 py-6 text-center text-[13px] text-lien-muted">Chưa có tin nhắn với khách về đơn này.</p>
        ) : (
          messages.map((m) => {
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
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                if (textRef.current) {
                  textRef.current.value = q;
                  textRef.current.focus();
                }
              }}
              className="rounded-full border border-lien-line bg-white px-3 py-1 text-[12px] text-lien-text hover:border-lien-blue hover:text-lien-blue"
            >
              {q}
            </button>
          ))}
        </div>
      ) : null}

      <form
        ref={formRef}
        action={formAction}
        className="mt-3"
        onSubmit={() => {
          // clear after the action runs (the list re-renders from the server)
          window.setTimeout(() => formRef.current?.reset(), 50);
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
          required
          maxLength={2000}
          rows={3}
          placeholder={me === "customer" ? "Nhắn cho LienStore về đơn này (giờ nhận hàng, đổi địa chỉ, hỏi tiến độ…)" : "Trả lời khách: tiến độ, bill, thay đổi phí…"}
          className="block w-full rounded-md border border-lien-input-border bg-white px-3 py-2 text-[14px] leading-6 text-lien-text outline-none focus:border-lien-blue focus:ring-2 focus:ring-lien-blue/20"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) formRef.current?.requestSubmit();
          }}
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <span className="text-[11px] text-lien-muted">Ctrl + Enter để gửi. Tin nhắn được lưu trong đơn hàng.</span>
          <button type="submit" disabled={pending} className="inline-flex h-10 items-center gap-2 rounded-full bg-lien-blue px-5 text-[13px] font-bold uppercase tracking-[1px] text-white hover:bg-lien-blue-hover disabled:opacity-60">
            <Fa name="comments-o" /> {pending ? "Đang gửi…" : "Gửi tin nhắn"}
          </button>
        </div>
      </form>
    </section>
  );
}
