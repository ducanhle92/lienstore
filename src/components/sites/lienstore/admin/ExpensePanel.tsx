import Image from "next/image";
import { createExpenseAction, deleteExpenseAction, deleteExpenseFileAction } from "@/app/admin/purchases/expense-actions";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { adminInput, adminLabel, btnPrimary, Card, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { EXPENSE_KINDS, sumExpenses, type Expense } from "@/lib/expenses";
import { formatDate, formatPrice } from "@/lib/format";
import { todayIso } from "@/lib/lots";

/**
 * Quản lý mua hàng › "Hoá đơn đồ tiêu hao": a <details id="expenses"> block opened by the bottom-bar button — the entry
 * form (like "Mở đợt mua mới") and the recent entries with their bill photos. Totals feed Kế toán › Lãi/lỗ.
 */
export function ExpensePanel({ expenses, rate, tab, open }: { expenses: Expense[]; rate: number; tab: string; open: boolean }) {
  const month = todayIso().slice(0, 7);
  const { byMonth } = sumExpenses(expenses);
  const thisMonth = byMonth.get(month) ?? 0;
  return (
    <details id="expenses" open={open} className="mb-5 min-w-0" data-testid="expenses">
      {/* nothing shows until the bar button "+ Hoá đơn đồ tiêu hao" opens the block (like Mở đợt mua mới) */}
      <summary className="hidden">Hoá đơn đồ tiêu hao</summary>
      <div className="mt-3 grid gap-3 lg:grid-cols-[380px_1fr]">
        <Card title="Nhập hoá đơn đồ tiêu hao">
          <form action={createExpenseAction} className="grid gap-3" data-testid="expense-create" encType="multipart/form-data">
            <input type="hidden" name="tab" value={tab} />
            <div>
              <label className={adminLabel} htmlFor="ex-title">
                Nội dung
              </label>
              <input id="ex-title" name="title" required maxLength={120} placeholder="VD: băng keo 5 cuộn + xốp bóng khí" className={adminInput} data-testid="expense-title" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={adminLabel} htmlFor="ex-kind">
                  Loại
                </label>
                <select id="ex-kind" name="kind" defaultValue="supplies" className={adminInput}>
                  {EXPENSE_KINDS.map((k) => (
                    <option key={k.key} value={k.key} title={k.hint}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={adminLabel} htmlFor="ex-date">
                  Ngày mua
                </label>
                <input type="date" id="ex-date" name="spentAt" defaultValue={todayIso()} className={adminInput} data-testid="expense-date" />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_110px]">
              <div>
                <label className={adminLabel} htmlFor="ex-amount">
                  Số tiền
                </label>
                <input id="ex-amount" name="amount" required inputMode="decimal" placeholder="VD: 1980" className={adminInput} data-testid="expense-amount" />
              </div>
              <div>
                <label className={adminLabel} htmlFor="ex-cur">
                  Tiền tệ
                </label>
                <select id="ex-cur" name="currency" defaultValue="JPY" className={adminInput} title={`¥ quy ra đ theo tỉ giá hiện tại ${rate.toLocaleString("vi-VN")}`} data-testid="expense-currency">
                  <option value="JPY">¥ Yên</option>
                  <option value="VND">đ VNĐ</option>
                </select>
              </div>
            </div>
            <div>
              <label className={adminLabel} htmlFor="ex-store">
                Nơi mua <span className="font-normal text-lien-muted">— tuỳ chọn</span>
              </label>
              <input id="ex-store" name="store" maxLength={80} placeholder="VD: Daiso, Amazon, Bách hoá xanh" className={adminInput} />
            </div>
            <div>
              <label className={adminLabel} htmlFor="ex-files">
                Ảnh / PDF hoá đơn <span className="font-normal text-lien-muted">— tuỳ chọn, nhiều tệp</span>
              </label>
              <input type="file" id="ex-files" name="files" multiple accept="image/*,application/pdf" className={adminInput} />
            </div>
            <div>
              <label className={adminLabel} htmlFor="ex-note">
                Ghi chú
              </label>
              <input id="ex-note" name="note" maxLength={300} className={adminInput} />
            </div>
            <button type="submit" className={`${btnPrimary} justify-self-start`} data-testid="expense-submit">
              <Fa name="check" /> Ghi hoá đơn
            </button>
            <p className="m-0 text-[12px] text-lien-muted">¥ quy ra VNĐ theo tỉ giá lúc ghi ({rate.toLocaleString("vi-VN")} đ/¥). Khoản này được trừ vào Lợi nhuận ở Kế toán › Lãi/lỗ theo ngày mua.</p>
          </form>
        </Card>
        <Card title={`Hoá đơn gần đây — tháng này ${formatPrice(thisMonth)} · ${expenses.length} hoá đơn`}>
          <div className="overflow-x-auto">
            <table className={tableClass} data-testid="expense-table">
              <thead>
                <tr>
                  <th className={thClass}>Ngày</th>
                  <th className={thClass}>Nội dung</th>
                  <th className={`${thClass} text-right`}>Số tiền</th>
                  <th className={`${thClass} text-right`}>≈ VNĐ</th>
                  <th className={thClass}>Bill</th>
                  <th className={thClass} />
                </tr>
              </thead>
              <tbody>
                {expenses.length === 0 ? (
                  <tr>
                    <td colSpan={6} className={`${tdClass} text-center text-lien-muted`}>
                      Chưa có hoá đơn nào.
                    </td>
                  </tr>
                ) : null}
                {expenses.map((e) => (
                  <tr key={e.id} id={`expense-${e.id}`} data-testid={`expense-${e.id}`}>
                    <td className={`${tdClass} whitespace-nowrap`}>{formatDate(e.spentAt)}</td>
                    <td className={tdClass}>
                      <span className="font-semibold text-lien-heading">{e.title}</span>
                      <span className="block text-[12px] text-lien-muted">
                        {EXPENSE_KINDS.find((k) => k.key === e.kind)?.label}
                        {e.store ? ` · ${e.store}` : ""}
                        {e.note ? ` · ${e.note}` : ""}
                      </span>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-right`}>{e.currency === "JPY" ? `¥${e.amount.toLocaleString("vi-VN")}` : formatPrice(e.amount)}</td>
                    <td className={`${tdClass} whitespace-nowrap text-right font-semibold`} title={e.rate ? `tỉ giá ${e.rate.toLocaleString("vi-VN")}` : undefined}>
                      {formatPrice(e.amountVnd)}
                    </td>
                    <td className={tdClass}>
                      <div className="flex flex-wrap items-center gap-1">
                        {e.files.map((f) => (
                          <span key={f.path} className="inline-flex items-center gap-1 rounded border border-[#e5e7eb] bg-white p-0.5">
                            <a href={f.url} target="_blank" rel="noreferrer" title={f.name} className="no-underline">
                              {f.mime.startsWith("image/") ? <Image src={f.url} alt={f.name} width={40} height={40} unoptimized className="h-10 w-10 rounded object-cover" /> : <span className="inline-block max-w-[120px] truncate px-1 text-[12px] text-lien-blue">{f.name}</span>}
                            </a>
                            <form action={deleteExpenseFileAction}>
                              <input type="hidden" name="tab" value={tab} />
                              <input type="hidden" name="id" value={e.id} />
                              <input type="hidden" name="path" value={f.path} />
                              <ConfirmSubmit message="Gỡ tệp này?" className="px-1 text-[11px] text-lien-heart hover:underline">
                                gỡ
                              </ConfirmSubmit>
                            </form>
                          </span>
                        ))}
                        {e.files.length === 0 ? <span className="text-[12px] text-lien-muted">—</span> : null}
                      </div>
                    </td>
                    <td className={`${tdClass} whitespace-nowrap text-right`}>
                      <form action={deleteExpenseAction}>
                        <input type="hidden" name="tab" value={tab} />
                        <input type="hidden" name="id" value={e.id} />
                        <ConfirmSubmit message={`Xoá hoá đơn “${e.title}” (${formatPrice(e.amountVnd)})?`} className="text-[13px] text-lien-heart hover:underline">
                          Xoá
                        </ConfirmSubmit>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </details>
  );
}
