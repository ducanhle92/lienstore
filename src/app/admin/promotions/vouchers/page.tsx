import { deleteVoucherAction, deleteVoucherProgramAction, saveVoucherAction, saveVoucherProgramAction } from "@/app/admin/promotions/actions";
import { ConfirmSubmit } from "@/components/sites/lienstore/admin/ConfirmSubmit";
import { InfoPopover } from "@/components/sites/lienstore/admin/InfoPopover";
import { adminInput, adminLabel, btnDanger, btnPrimary, btnSecondary, Card, Flash, PageHeader } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getVoucherPrograms, getVouchers } from "@/lib/db";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { VOUCHER_COLORS, VOUCHER_PALETTE, voucherPalette } from "@/lib/voucher-programs";
import type { Voucher, VoucherProgram } from "@/types/shop";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Asia/Ho_Chi_Minh" }) : "");

/** One program: name / subtitle / colour / order / on-off, saved in place. */
function ProgramForm({ p, count }: { p?: VoucherProgram; count?: number }) {
  const pal = voucherPalette(p?.color);
  return (
    <form action={saveVoucherProgramAction} className="grid gap-3 md:grid-cols-[1fr_1fr_auto_90px_auto_auto] md:items-end" data-testid={p ? `program-${p.id}` : "program-new"}>
      {p ? <input type="hidden" name="id" value={p.id} /> : null}
      <div>
        <label className={adminLabel}>Tên chương trình *</label>
        <input name="name" required defaultValue={p?.name ?? ""} placeholder="VD: Ưu đãi độc quyền, Mừng khai trương…" className={adminInput} />
      </div>
      <div>
        <label className={adminLabel}>
          Dòng phụ <span className="font-normal text-lien-muted">(sau tên trên banner)</span>
        </label>
        <input name="subtitle" defaultValue={p?.subtitle ?? ""} placeholder="Nhập mã ở trang thanh toán" className={adminInput} />
      </div>
      <div>
        <label className={adminLabel}>Màu banner</label>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Màu banner">
          {VOUCHER_COLORS.map((c) => (
            <label key={c} title={VOUCHER_PALETTE[c].label} className="cursor-pointer">
              <input type="radio" name="color" value={c} defaultChecked={(p?.color ?? "red") === c} className="peer sr-only" />
              <span className={cn("block h-7 w-7 rounded-full border-2 border-white shadow ring-1 ring-[#d1d5db] peer-checked:ring-2 peer-checked:ring-lien-heading peer-checked:ring-offset-1", VOUCHER_PALETTE[c].swatch)} />
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className={adminLabel}>Thứ tự</label>
        <input name="position" inputMode="numeric" defaultValue={p?.position ?? 0} className={adminInput} />
      </div>
      <label className="inline-flex items-center gap-2 pb-2.5 text-[14px] whitespace-nowrap">
        <input type="checkbox" name="active" defaultChecked={p ? p.active : true} className="h-4 w-4" /> Hiện trên trang chủ
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" className={p ? btnSecondary : btnPrimary}>
          <Fa name={p ? "check" : "plus"} /> {p ? "Lưu" : "Thêm chương trình"}
        </button>
        {p ? <span className={cn("hidden h-6 w-6 rounded-full md:block", pal.swatch)} aria-hidden /> : null}
      </div>
      {p ? <p className="m-0 text-[12px] text-lien-muted md:col-span-6">{count ?? 0} voucher trong chương trình này. Xoá chương trình không xoá voucher; voucher sẽ chuyển sang chương trình đầu tiên.</p> : null}
    </form>
  );
}

function VoucherForm({ v, programs }: { v?: Voucher; programs: VoucherProgram[] }) {
  return (
    <form action={saveVoucherAction} encType="multipart/form-data" className="grid gap-3 md:grid-cols-6 md:items-end">
      {v ? <input type="hidden" name="id" value={v.id} /> : null}
      <div>
        <label className={adminLabel}>Mã *</label>
        <input name="code" required defaultValue={v?.code ?? ""} placeholder="VD: TET2027" className={`${adminInput} uppercase`} />
      </div>
      <div>
        <label className={adminLabel}>
          Chương trình
          <InfoPopover>Voucher hiện trong banner của chương trình này trên trang chủ (tên và màu banner đặt ở khung “Chương trình voucher” phía trên).</InfoPopover>
        </label>
        <select name="programId" defaultValue={v?.programId ?? programs[0]?.id ?? ""} className={adminInput}>
          {programs.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.active ? "" : " (đang ẩn)"}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={adminLabel}>Loại</label>
        <select name="kind" defaultValue={v?.kind ?? "percent"} className={adminInput}>
          <option value="percent">Giảm %</option>
          <option value="fixed">Giảm số tiền (đ)</option>
        </select>
      </div>
      <div>
        <label className={adminLabel}>Giá trị *</label>
        <input name="value" required inputMode="numeric" defaultValue={v ? (v.kind === "percent" ? v.value : formatAmount(v.value)) : ""} placeholder="10 hoặc 50.000" className={adminInput} />
      </div>
      <div>
        <label className={adminLabel}>Đơn tối thiểu (đ)</label>
        <input name="minSubtotal" inputMode="numeric" defaultValue={v?.minSubtotal ? formatAmount(v.minSubtotal) : ""} className={adminInput} />
      </div>
      <div>
        <label className={adminLabel}>Giảm tối đa (đ)</label>
        <input name="maxDiscount" inputMode="numeric" defaultValue={v?.maxDiscount ? formatAmount(v.maxDiscount) : ""} placeholder="không giới hạn" className={adminInput} />
      </div>
      <div>
        <label className={adminLabel}>Số lượt</label>
        <input name="usageLimit" inputMode="numeric" defaultValue={v?.usageLimit ?? ""} placeholder="không giới hạn" className={adminInput} />
      </div>
      <div>
        <label className={adminLabel}>Từ ngày</label>
        <input name="startsAt" type="date" defaultValue={day(v?.startsAt ?? null)} className={adminInput} />
      </div>
      <div>
        <label className={adminLabel}>Đến ngày</label>
        <input name="endsAt" type="date" defaultValue={day(v?.endsAt ?? null)} className={adminInput} />
      </div>
      <div className="md:col-span-2">
        <label className={adminLabel}>Ghi chú</label>
        <input name="note" defaultValue={v?.note ?? ""} placeholder="VD: khách mới, livestream 20/10…" className={adminInput} />
      </div>
      <label className="inline-flex items-center gap-2 pb-2.5 text-[14px]">
        <input type="checkbox" name="active" defaultChecked={v ? v.active : true} className="h-4 w-4" /> Đang chạy
      </label>
      <label className="inline-flex items-center gap-2 pb-2.5 text-[14px] md:col-span-2">
        <input type="checkbox" name="showHome" defaultChecked={v ? v.showHome : true} className="h-4 w-4" /> Hiện trong banner chương trình trên trang chủ
      </label>
      <div className="md:col-span-6 rounded-md border border-dashed border-[#d1d5db] p-3">
        <label className={adminLabel}>
          Tặng riêng cho tài khoản <span className="font-normal text-lien-muted">— để trống = mọi khách. Nhập mã khách hàng (10001…), ID đăng nhập hoặc email, mỗi dòng một tài khoản; hoặc tải file CSV/TXT xuất từ Excel (cột đầu).</span>
        </label>
        <div className="grid gap-2 md:grid-cols-[1fr_280px]">
          <textarea name="customers" rows={3} defaultValue={v?.customerLabels.join("\n") ?? ""} placeholder={"10001\n10002\nlinh.nguyen@gmail.com"} className={`${adminInput} font-mono text-[13px]`} />
          <input type="file" name="customersFile" accept=".csv,.txt,text/csv,text/plain" className="text-[13px]" />
        </div>
        {v?.customerIds.length ? <p className="m-0 mt-1 text-[12px] text-lien-muted">Đang tặng riêng cho {v.customerIds.length} tài khoản; chỉ các tài khoản này nhập mã được, khách thấy mã trong mục Voucher của tài khoản và trên trang chủ khi đăng nhập.</p> : null}
      </div>
      <div className="flex gap-2">
        <button type="submit" className={v ? btnSecondary : btnPrimary}>
          <Fa name={v ? "check" : "plus"} /> {v ? "Lưu" : "Tạo voucher"}
        </button>
      </div>
    </form>
  );
}

/** Sales › Voucher: programs (one home-page banner each, own colour) and the codes inside them. */
export default async function AdminVouchers({ searchParams }: Props) {
  await requireAdmin("promotions");
  const sp = await searchParams;
  const [vouchers, programs] = await Promise.all([getVouchers(), getVoucherPrograms()]);
  const now = new Date().toISOString();
  const state = (v: Voucher) => {
    if (!v.active) return { label: "Tắt", cls: "bg-gray-200 text-gray-700" };
    if (v.endsAt && now > v.endsAt) return { label: "Hết hạn", cls: "bg-gray-200 text-gray-700" };
    if (v.startsAt && now < v.startsAt) return { label: "Chưa tới ngày", cls: "bg-amber-100 text-amber-800" };
    if (v.usageLimit !== null && v.usedCount >= v.usageLimit) return { label: "Hết lượt", cls: "bg-gray-200 text-gray-700" };
    return { label: "Đang chạy", cls: "bg-green-100 text-green-800" };
  };
  const countIn = (id: number) => vouchers.filter((v) => v.programId === id).length;
  const programOf = (v: Voucher) => programs.find((p) => p.id === v.programId) ?? programs[0];

  return (
    <>
      <PageHeader title="Voucher" subtitle={`${programs.length} chương trình · ${vouchers.length} mã · khách nhập mã ở trang thanh toán, giảm trừ vào tạm tính (không tính phí ship)`} />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <Card className="mb-6" title="Chương trình voucher — mỗi chương trình là một banner riêng trên trang chủ">
        <p className="m-0 mb-4 text-[13px] leading-5 text-lien-muted">Tên chương trình là tiêu đề banner (trước đây cố định “Ưu đãi độc quyền”). Có nhiều chương trình đang hiện thì trang chủ xếp nhiều banner theo Thứ tự, mỗi banner một màu. Voucher tặng riêng cho tài khoản luôn nổi màu đỏ trong banner của chương trình nó thuộc về.</p>
        <div className="space-y-4">
          {programs.map((p) => {
            const pal = voucherPalette(p.color);
            return (
              <section key={p.id} className={cn("rounded-lg border p-4", pal.border, pal.soft)}>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={cn("rounded-md px-2.5 py-1 text-[12px] font-bold uppercase tracking-wide", pal.band)}>
                    <Fa name="gift" /> {p.name}
                  </span>
                  {p.subtitle ? <span className="text-[12px] text-lien-muted">· {p.subtitle}</span> : null}
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", p.active ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700")}>{p.active ? "Đang hiện" : "Đang ẩn"}</span>
                  <span className="text-[12px] text-lien-muted">{pal.label}</span>
                  <form action={deleteVoucherProgramAction} className="ml-auto">
                    <input type="hidden" name="id" value={p.id} />
                    <ConfirmSubmit title={`Xoá chương trình “${p.name}”?`} message="Banner của chương trình sẽ biến mất khỏi trang chủ." details={[`${countIn(p.id)} voucher trong chương trình được chuyển sang chương trình đầu tiên, không bị xoá.`]} confirmLabel="Xoá chương trình" className={`${btnDanger} !px-2.5 !py-1.5 !text-[13px]`}>
                      <Fa name="trash" /> Xoá
                    </ConfirmSubmit>
                  </form>
                </div>
                <ProgramForm p={p} count={countIn(p.id)} />
              </section>
            );
          })}
          <details className="rounded-lg border border-dashed border-[#d1d5db] bg-white" open={programs.length === 0}>
            <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 text-[14px] font-semibold text-lien-blue select-none">
              <Fa name="plus" /> Thêm chương trình
            </summary>
            <div className="border-t border-[#e5e7eb] p-4">
              <ProgramForm />
            </div>
          </details>
        </div>
      </Card>

      <details className="group mb-6 rounded-lg border border-dashed border-[#d1d5db] bg-white" open={vouchers.length === 0}>
        <summary className="flex cursor-pointer items-center gap-2 px-5 py-3 text-[14px] font-semibold text-lien-blue select-none">
          <Fa name="plus" /> Tạo voucher mới
        </summary>
        <div className="border-t border-[#e5e7eb] p-5">
          <VoucherForm programs={programs} />
        </div>
      </details>

      <div className="space-y-4">
        {vouchers.map((v) => {
          const st = state(v);
          const p = programOf(v);
          const pal = voucherPalette(p?.color);
          return (
            <section key={v.id} className="rounded-lg border border-[#e5e7eb] bg-white shadow-sm">
              <div id={`voucher-${v.id}`} className="flex flex-wrap items-center gap-3 border-b border-[#f0f0f0] px-5 py-3">
                <span className="rounded bg-lien-heading px-2.5 py-1 font-mono text-[15px] font-bold tracking-wider text-white">{v.code}</span>
                <span className="text-[14px] font-semibold text-lien-heading">{v.kind === "percent" ? `Giảm ${v.value}%` : `Giảm ${formatAmount(v.value)}đ`}</span>
                {v.minSubtotal ? <span className="text-[13px] text-lien-muted">đơn từ {formatAmount(v.minSubtotal)}đ</span> : null}
                {v.maxDiscount ? <span className="text-[13px] text-lien-muted">tối đa {formatAmount(v.maxDiscount)}đ</span> : null}
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${st.cls}`}>{st.label}</span>
                {p ? (
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold text-white", pal.solid)} title="Chương trình">
                    {p.name}
                  </span>
                ) : null}
                {v.customerIds.length ? <span className="rounded-full bg-purple-100 px-2 py-0.5 text-[11px] font-semibold text-purple-800">Riêng cho {v.customerIds.length} tài khoản</span> : v.showHome ? <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-800">Hiện trang chủ</span> : null}
                <span className="ml-auto text-[13px] text-lien-muted">
                  Đã dùng {v.usedCount}
                  {v.usageLimit !== null ? `/${v.usageLimit}` : ""} lượt
                  {v.startsAt || v.endsAt ? ` · ${day(v.startsAt) || "…"} → ${day(v.endsAt) || "…"}` : ""}
                </span>
                <form action={deleteVoucherAction}>
                  <input type="hidden" name="id" value={v.id} />
                  <ConfirmSubmit title={`Xoá voucher ${v.code}?`} message="Khách không nhập được mã này nữa; đơn đã dùng mã không đổi." confirmLabel="Xoá voucher" className={`${btnDanger} !px-2.5 !py-1.5 !text-[13px]`}>
                    <Fa name="trash" />
                  </ConfirmSubmit>
                </form>
              </div>
              <details>
                <summary className="cursor-pointer px-5 py-2 text-[13px] text-lien-blue select-none">
                  <Fa name="pencil" /> Sửa
                </summary>
                <div className="border-t border-[#f0f0f0] p-5">
                  <VoucherForm v={v} programs={programs} />
                </div>
              </details>
            </section>
          );
        })}
        {vouchers.length === 0 ? <p className="text-[14px] text-lien-muted">Chưa có voucher nào. Tạo mã đầu tiên ở khung phía trên.</p> : null}
      </div>
    </>
  );
}
