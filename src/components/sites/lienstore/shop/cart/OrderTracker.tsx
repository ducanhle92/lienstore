"use client";

import { useLang } from "@/components/sites/lienstore/shared/LangProvider";
import { formatDateTime } from "@/lib/format";
import type { I18nKey } from "@/lib/i18n";
import { SHIP_STAGES, stageIndex } from "@/lib/shipping";
import { cn } from "@/lib/utils";
import type { Order } from "@/types/shop";

/**
 * Mercari-style progress line: one dot per logistics stage, reached stages coloured, the current one highlighted,
 * dates from the stage log underneath. Server-renderable (no state).
 */
export function OrderTracker({ order, className, compact = false }: { order: Pick<Order, "shipStage" | "stageLog" | "status"> & Partial<Pick<Order, "paymentMethod" | "stockCommittedAt">>; className?: string; compact?: boolean }) {
  const { lang, t } = useLang();
  const cod = order.paymentMethod === "cod";
  // a pay-on-delivery order passes the payment step as "Thu khi giao" (stock was deducted when the admin granted it)
  const label = (key: string, fallback: string) => (cod && key === "paid" ? (lang === "ja" ? "代引き" : "Thu khi giao") : lang === "ja" ? t(`stage_${key}` as I18nKey) : fallback);
  const cur = stageIndex(order.shipStage);
  const cancelled = order.status === "cancelled";
  const reachedAt = (key: string) => order.stageLog.filter((l) => l.stage === key).at(-1)?.at;
  const note = order.stageLog.at(-1)?.note;
  const n = SHIP_STAGES.length;
  const pct = n > 1 ? (cur / (n - 1)) * 100 : 0;
  return (
    <div className={cn("order-tracker", className)} aria-label="Trạng thái vận chuyển">
      {cancelled ? <p className="m-0 mb-3 rounded-md bg-[#fde8ea] px-3 py-2 text-[13px] font-semibold text-[#842029]">Đơn hàng đã huỷ.</p> : null}
      <ol className="relative m-0 grid list-none p-0" style={{ gridTemplateColumns: `repeat(${SHIP_STAGES.length}, minmax(0, 1fr))` }}>
        {/* rail */}
        <span aria-hidden="true" className="absolute top-[7px] h-[3px] rounded bg-[#e5e5e5]" style={{ left: `calc(100% / ${n * 2})`, right: `calc(100% / ${n * 2})` }} />
        <span aria-hidden="true" className={cn("absolute top-[7px] h-[3px] rounded transition-[width]", cancelled ? "bg-[#9ca3af]" : "bg-lien-heart")} style={{ left: `calc(100% / ${n * 2})`, width: `calc((100% - 100% / ${n}) * ${pct / 100})` }} />
        {SHIP_STAGES.map((s, i) => {
          const done = i <= cur && !cancelled;
          const current = i === cur && !cancelled;
          const at = reachedAt(s.key);
          return (
            <li key={s.key} className="relative flex flex-col items-center text-center" title={cod && s.key === "paid" ? `Thu khi giao${order.stockCommittedAt ? ` · trừ tồn kho lúc ${formatDateTime(order.stockCommittedAt)}` : ""}` : s.hint}>
              <span
                className={cn(
                  "relative z-[1] block h-[17px] w-[17px] rounded-full border-[3px] bg-white",
                  done ? "border-lien-heart" : "border-[#d1d5db]",
                  current && "shadow-[0_0_0_4px_rgba(232,32,22,0.15)]",
                )}
              >
                {done ? <span className={cn("absolute inset-[3px] rounded-full", current ? "bg-lien-heart" : "bg-lien-heart/70")} /> : null}
              </span>
              <span className={cn("mt-2 text-[11px] leading-4 sm:text-[12px]", current ? "font-bold text-lien-heart" : done ? "font-semibold text-lien-heading" : "text-lien-muted", compact && "hidden sm:block")}>
                <span className="sm:hidden">{cod && s.key === "paid" ? (lang === "ja" ? "代引き" : "Thu khi giao") : s.short}</span>
                <span className="hidden sm:inline">{label(s.key, s.label)}</span>
              </span>
              {at && done && !compact ? <span className="mt-0.5 hidden text-[10px] leading-4 text-lien-muted md:block">{formatDateTime(at)}</span> : null}
            </li>
          );
        })}
      </ol>
      {!compact ? (
        <p className="m-0 mt-3 text-center text-[13px] leading-5 text-lien-text">
          <strong className={cancelled ? "text-[#842029]" : "text-lien-heart"}>{cancelled ? (lang === "ja" ? "キャンセル済み" : "Đã huỷ") : label(SHIP_STAGES[cur].key, SHIP_STAGES[cur].label)}</strong>
          {!cancelled ? <span className="text-lien-muted"> · {SHIP_STAGES[cur].hint}</span> : null}
          {note ? <span className="block text-lien-muted">Ghi chú: {note}</span> : null}
        </p>
      ) : null}
    </div>
  );
}
