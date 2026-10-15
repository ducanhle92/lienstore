"use client";

import { useActionState, useState } from "react";
import { createApiTokenAction, type CreateTokenState } from "@/app/admin/api-tokens/actions";
import { API_SCOPE_LABELS, API_SCOPES } from "@/lib/api-scopes";
import { adminInput, adminLabel, btnPrimary, btnSecondary } from "@/components/sites/lienstore/admin/ui";

/** Issue a token; the raw value is shown once, right here, and is gone after leaving the page. */
export function ApiTokenCreateForm() {
  const [state, action, pending] = useActionState<CreateTokenState, FormData>(createApiTokenAction, null);
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      {state?.token ? (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 text-[13px] leading-5" data-testid="new-token">
          <p className="mb-2 font-semibold text-amber-900">Token “{state.name}” — chỉ hiện MỘT lần, hãy lưu ngay vào file cấu hình CLI (không dán vào chat / commit):</p>
          <code className="block break-all rounded bg-white px-2 py-1.5 font-mono text-[12px]">{state.token}</code>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className={btnSecondary}
              onClick={() => {
                void navigator.clipboard.writeText(state.token ?? "").then(() => setCopied(true));
              }}
            >
              {copied ? "Đã chép" : "Chép token"}
            </button>
            <span className="text-amber-900">
              Ghi vào <code>.env.lienstore.local</code>: <code>LIENSTORE_API_TOKEN=…</code>
            </span>
          </div>
        </div>
      ) : null}
      {state?.error ? <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{state.error}</p> : null}
      <form action={action} className="space-y-3">
        <div>
          <label className={adminLabel} htmlFor="tok-name">
            Tên (để nhận ra khi thu hồi)
          </label>
          <input id="tok-name" name="name" required maxLength={80} placeholder="T3 Code agent — máy AnhLD" className={adminInput} />
        </div>
        <fieldset>
          <legend className={adminLabel}>Quyền</legend>
          {API_SCOPES.map((s) => (
            <label key={s} className="flex items-start gap-2 py-1 text-[13px]">
              <input type="checkbox" name="scopes" value={s} defaultChecked={s === "products:read"} className="mt-0.5" />
              <span>
                <code>{s}</code> — {API_SCOPE_LABELS[s]}
              </span>
            </label>
          ))}
        </fieldset>
        <div>
          <label className={adminLabel} htmlFor="tok-days">
            Hết hạn sau (ngày, 0 = không hết hạn)
          </label>
          <input id="tok-days" name="days" type="number" min={0} max={3650} defaultValue={90} className={adminInput} />
        </div>
        <button type="submit" className={btnPrimary} disabled={pending}>
          {pending ? "Đang tạo…" : "Cấp token"}
        </button>
      </form>
    </div>
  );
}
