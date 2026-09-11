"use client";

import { useState } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { useLang } from "@/components/sites/lienstore/shared/LangProvider";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface StripVoucher {
  code: string;
  kind: "percent" | "fixed";
  value: number;
  minSubtotal: number;
  maxDiscount: number | null;
  endsAt: string | null;
  /** Assigned to the signed-in customer only. */
  personal: boolean;
  note: string;
}

function CopyButton({ code }: { code: string }) {
  const { t } = useLang();
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(code);
        } catch {
          /* clipboard blocked: the code is visible anyway */
        }
        setDone(true);
        window.setTimeout(() => setDone(false), 1800);
      }}
      className={cn(
        "rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap transition-colors",
        done ? "bg-lien-heading text-white" : "bg-lien-blue text-white hover:bg-lien-blue-hover",
      )}
    >
      {done ? t("copied") : t("copyCode")}
    </button>
  );
}

const day = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

/**
 * "Ưu đãi độc quyền website" banner in the brand colour: a header band, then one ticket per voucher — coloured stub with
 * the discount, condition + code + expiry, and a copy button.
 */
export function VoucherStrip({ vouchers, className }: { vouchers: StripVoucher[]; className?: string }) {
  const { t } = useLang();
  if (!vouchers.length) return null;
  return (
    <section aria-label={t("homeVouchers")} className={cn("my-8 overflow-hidden rounded-xl border border-lien-blue/30 bg-lien-blue-soft/50", className)}>
      <div className="flex items-center gap-3 bg-gradient-to-r from-lien-blue to-lien-blue-hover px-4 py-2.5 text-white">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-[15px]">
          <Fa name="gift" />
        </span>
        <h2 className="m-0 text-[15px] font-bold uppercase tracking-[0.4px]">{t("homeVouchers")}</h2>
        <span className="hidden text-[12px] text-white/85 sm:inline">· {t("voucherHint")}</span>
      </div>
      <ul className="m-0 grid list-none gap-3 p-3 sm:grid-cols-2 lg:grid-cols-4">
        {vouchers.map((v) => {
          const big = v.kind === "percent" ? `${v.value}%` : v.value >= 1000 ? `${Math.round(v.value / 1000)}K` : formatAmount(v.value);
          const headline = v.kind === "percent" ? `${t("discountWord")} ${v.value}%` : `${t("discountWord")} ${formatAmount(v.value)}đ`;
          return (
            <li key={v.code} className={cn("relative flex overflow-hidden rounded-lg border bg-white shadow-sm", v.personal ? "border-lien-sale/60" : "border-lien-blue/25")}>
              {/* ticket stub */}
              <div className={cn("relative flex w-[76px] shrink-0 flex-col items-center justify-center text-white", v.personal ? "bg-lien-sale" : "bg-lien-blue")}>
                <Fa name="tag" className="text-[15px] opacity-90" />
                <span className="mt-0.5 text-[17px] font-extrabold leading-none">{big}</span>
                <span className="mt-0.5 text-[9px] font-semibold uppercase opacity-90">{t("discountWord")}</span>
                <span aria-hidden="true" className="absolute top-1/2 -right-2 h-4 w-4 -translate-y-1/2 rounded-full bg-white" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col justify-between gap-1 border-l border-dashed border-lien-blue/30 px-3 py-2">
                <div>
                  <p className="m-0 truncate text-[14px] font-bold text-lien-heading">{headline}</p>
                  <p className="m-0 text-[12px] leading-4 text-lien-muted">
                    {v.minSubtotal ? `${t("orderFrom")} ${formatAmount(v.minSubtotal)}đ` : t("anyOrder")}
                    {v.maxDiscount ? ` · ${t("maxDiscount")} ${formatAmount(v.maxDiscount)}đ` : ""}
                  </p>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <p className="m-0 min-w-0 text-[11px] leading-4 text-lien-muted">
                    {t("codeWord")}: <strong className="font-mono text-[12px] text-lien-blue">{v.code}</strong>
                    {v.endsAt ? <span className="block">{t("expiry")}: {day(v.endsAt)}</span> : null}
                    {v.personal ? <span className="block font-semibold text-lien-sale">{t("voucherPersonal")}</span> : null}
                  </p>
                  <CopyButton code={v.code} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
