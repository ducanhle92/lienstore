import QRCode from "qrcode";
import { deleteBankAccountAction, saveBankAccountAction, savePayPrefixAction, setDefaultBankAccountAction } from "@/app/admin/accounting/banks/actions";
import { adminInput, adminLabel, btnDanger, btnPrimary, btnSecondary, Card, Flash, PageHeader } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getPayPrefix, listBankAccounts } from "@/lib/bank-config";
import { makePayCode } from "@/lib/pay-code";
import { BANK_BINS, vietQrPayload } from "@/lib/vietqr";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const BANK_OPTIONS = Object.entries(BANK_BINS).filter(([code, v], i, arr) => arr.findIndex(([, w]) => w.bin === v.bin) === i && code === code.toUpperCase());

/** Kế toán › Tài khoản ngân hàng: receiving accounts for the transfer QR + the payment-code prefix. */
export default async function AdminBankAccounts({ searchParams }: Props) {
  await requireAdmin("accounting");
  const sp = await searchParams;
  const [accounts, prefix] = await Promise.all([listBankAccounts(true), getPayPrefix()]);
  const previews = await Promise.all(accounts.map((a) => QRCode.toString(vietQrPayload({ bank: a.bin, accountNumber: a.accountNumber }), { type: "svg", margin: 1, width: 88 })));
  return (
    <>
      <PageHeader title="Tài khoản ngân hàng nhận tiền" subtitle="Tài khoản mặc định được gắn vào từng đơn khi khách đặt và dùng để sinh mã QR động (ngân hàng · số TK · số tiền · mã thanh toán). Đổi mặc định chỉ ảnh hưởng đơn mới." back={{ href: "/admin/accounting/", label: "Kế toán" }} />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          {accounts.map((a, i) => (
            <Card key={a.id} className={a.isDefault ? "border-lien-blue" : ""}>
              <div className="flex flex-wrap items-start gap-4" data-testid={`bank-${a.id}`}>
                <div className="rounded border border-[#e5e7eb] bg-white p-1" dangerouslySetInnerHTML={{ __html: previews[i] }} />
                <div className="min-w-[220px] flex-1 text-[13px] leading-6">
                  <p className="m-0 text-[15px] font-bold text-lien-heading">
                    {BANK_BINS[a.bank]?.name ?? a.bank} <span className="font-normal text-lien-muted">({a.bin})</span>
                    {a.isDefault ? <span className="ml-2 rounded-full bg-lien-blue px-2 py-0.5 text-[11px] font-semibold text-white">mặc định</span> : null}
                    {!a.active ? <span className="ml-2 rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700">đang tắt</span> : null}
                  </p>
                  <p className="m-0 font-mono text-[16px] font-semibold tracking-wide">{a.accountNumber}</p>
                  <p className="m-0">
                    {a.accountName}
                    {a.branch ? <span className="text-lien-muted"> · {a.branch}</span> : null}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {!a.isDefault && a.active ? (
                      <form action={setDefaultBankAccountAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <button type="submit" className={`${btnPrimary} !px-2.5 !py-1 !text-[12px]`}>
                          <Fa name="check" /> Đặt mặc định
                        </button>
                      </form>
                    ) : null}
                    {!a.isDefault ? (
                      <form action={deleteBankAccountAction}>
                        <input type="hidden" name="id" value={a.id} />
                        <button type="submit" className={`${btnDanger} !px-2.5 !py-1 !text-[12px]`}>
                          <Fa name="trash" /> Xoá
                        </button>
                      </form>
                    ) : null}
                    <details className="w-full">
                      <summary className="cursor-pointer select-none text-[12px] font-semibold text-lien-blue">
                        <Fa name="cog" className="mr-1" /> Sửa
                      </summary>
                      <form action={saveBankAccountAction} className="mt-2 grid gap-2 rounded-md border border-[#e5e7eb] bg-[#fafafa] p-3 sm:grid-cols-2">
                        <input type="hidden" name="id" value={a.id} />
                        <select name="bank" defaultValue={a.bank} className={adminInput} aria-label="Ngân hàng">
                          {BANK_OPTIONS.map(([code, v]) => (
                            <option key={code} value={code}>
                              {v.name} ({v.bin})
                            </option>
                          ))}
                        </select>
                        <input name="accountNumber" defaultValue={a.accountNumber} inputMode="numeric" className={adminInput} aria-label="Số tài khoản" />
                        <input name="accountName" defaultValue={a.accountName} className={adminInput} aria-label="Chủ tài khoản" />
                        <input name="branch" defaultValue={a.branch} placeholder="Chi nhánh (hiển thị)" className={adminInput} aria-label="Chi nhánh" />
                        <label className="flex items-center gap-2 text-[13px]">
                          <input type="checkbox" name="active" value="1" defaultChecked={a.active} className="h-4 w-4" /> Đang dùng
                          <input type="hidden" name="active" value="0" />
                        </label>
                        <button type="submit" className={`${btnSecondary} justify-self-start`}>
                          <Fa name="check" /> Lưu
                        </button>
                      </form>
                    </details>
                  </div>
                </div>
              </div>
            </Card>
          ))}

          <Card title="Thêm tài khoản">
            <form action={saveBankAccountAction} className="grid gap-3 sm:grid-cols-2" data-testid="bank-add">
              <div>
                <label className={adminLabel} htmlFor="nb-bank">
                  Ngân hàng
                </label>
                <select id="nb-bank" name="bank" defaultValue="BIDV" className={adminInput}>
                  {BANK_OPTIONS.map(([code, v]) => (
                    <option key={code} value={code}>
                      {v.name} ({v.bin})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={adminLabel} htmlFor="nb-acc">
                  Số tài khoản
                </label>
                <input id="nb-acc" name="accountNumber" inputMode="numeric" required className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="nb-name">
                  Chủ tài khoản (in hoa không dấu)
                </label>
                <input id="nb-name" name="accountName" required className={adminInput} />
              </div>
              <div>
                <label className={adminLabel} htmlFor="nb-branch">
                  Chi nhánh (hiển thị)
                </label>
                <input id="nb-branch" name="branch" className={adminInput} />
              </div>
              <div className="sm:col-span-2">
                <button type="submit" className={btnPrimary}>
                  <Fa name="plus" /> Thêm tài khoản
                </button>
              </div>
            </form>
          </Card>
        </div>

        <Card title="Mã thanh toán của đơn">
          <form action={savePayPrefixAction} className="flex items-end gap-2">
            <div>
              <label className={adminLabel} htmlFor="prefix">
                Tiền tố (chữ cái)
              </label>
              <input id="prefix" name="prefix" defaultValue={prefix} maxLength={6} className={`${adminInput} !mb-0 !w-[120px] uppercase`} />
            </div>
            <button type="submit" className={btnPrimary}>
              <Fa name="check" /> Lưu
            </button>
          </form>
          <p className="mt-3 text-[13px] leading-6 text-lien-text">
            Mỗi đơn có một mã duy nhất, ví dụ <code className="rounded bg-lien-cream px-1.5 font-bold">{makePayCode(prefix, 1034, ((i) => () => [0.3, 0.72, 0.51][i++ % 3])(0))}</code>: tiền tố + số đơn + 3 ký tự ngẫu nhiên; chỉ chữ in hoa và số, không dấu, không khoảng trắng. Mã được lưu vào đơn khi khách đặt và là toàn bộ nội dung chuyển khoản (trong QR lẫn hướng dẫn), nên ngân hàng/SePay báo về là đối chiếu được ngay.
          </p>
        </Card>
      </div>
    </>
  );
}
