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
      className={cn("rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white transition-colors", done ? "bg-lien-success" : "bg-lien-blue hover:bg-lien-blue-hover")}
    >
      {done ? t("copied") : t("copyCode")}
    </button>
  );
}

const day = (iso: string) => new Date(iso).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

/** "Ưu đãi độc quyền website": one card per voucher with the code, condition, expiry and a copy button. */
export function VoucherStrip({ vouchers, className }: { vouchers: StripVoucher[]; className?: string }) {
  const { t } = useLang();
  if (!vouchers.length) return null;
  return (
    <section aria-label={t("homeVouchers")} className={cn("my-8", className)}>
      <h2 className="m-0 mb-3 flex items-center gap-2 text-[15px] font-bold uppercase tracking-[0.3px] text-lien-heading">
        <Fa name="gift" className="text-lien-sale" />
        {t("homeVouchers")}
      </h2>
      <ul className="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-4">
        {vouchers.map((v) => {
          const headline = v.kind === "percent" ? `${t("discountWord")} ${v.value}%` : `${t("discountWord")} ${formatAmount(v.value)}đ`;
          return (
            <li key={v.code} className={cn("relative flex gap-3 rounded-lg border bg-white p-3 shadow-sm", v.personal ? "border-lien-sale/60" : "border-dashed border-lien-line")}>
              <span className={cn("flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-md text-center text-[11px] font-bold leading-tight text-white", v.personal ? "bg-lien-sale" : "bg-lien-blue")}>
                <Fa name="tag" className="mb-0.5 text-[16px]" />
                {v.kind === "percent" ? `${v.value}%` : `${Math.round(v.value / 1000)}K`}
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 truncate text-[14px] font-bold text-lien-heading">{headline}</p>
                <p className="m-0 text-[12px] text-lien-muted">
                  {v.minSubtotal ? `${t("orderFrom")} ${formatAmount(v.minSubtotal)}đ` : t("anyOrder")}
                  {v.maxDiscount ? ` · ${t("maxDiscount")} ${formatAmount(v.maxDiscount)}đ` : ""}
                </p>
                <p className="m-0 mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-lien-muted">
                  <span>
                    {t("codeWord")}: <strong className="font-mono text-lien-heading">{v.code}</strong>
                  </span>
                  {v.endsAt ? <span>· {t("expiry")}: {day(v.endsAt)}</span> : null}
                </p>
                {v.personal ? <p className="m-0 mt-1 text-[11px] font-semibold text-lien-sale">{t("voucherPersonal")}</p> : null}
              </div>
              <div className="flex flex-col justify-end">
                <CopyButton code={v.code} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
