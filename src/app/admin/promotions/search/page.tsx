import { hideSearchTermAction, saveSearchSuggestAction } from "@/app/admin/promotions/actions";
import { InfoPopover } from "@/components/sites/lienstore/admin/InfoPopover";
import { adminInput, adminLabel, btnPrimary, btnSecondary, Card, Flash, PageHeader, tableClass, tdClass, thClass } from "@/components/sites/lienstore/admin/ui";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { requireAdmin } from "@/lib/auth";
import { getSearchSuggestions, guessedBrands, searchLists, topSearchTerms } from "@/lib/search-suggest";

export const dynamic = "force-dynamic";

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

/** Sales › Gợi ý tìm kiếm: what the header search dropdown shows (trending terms, brands) and what shoppers searched. */
export default async function SearchSuggestAdmin({ searchParams }: Props) {
  await requireAdmin("promotions");
  const sp = await searchParams;
  const [lists, top, guessed, live] = await Promise.all([searchLists(), topSearchTerms(undefined, 40), guessedBrands(), getSearchSuggestions()]);

  return (
    <>
      <PageHeader title="Gợi ý tìm kiếm" subtitle="Khi khách bấm vào ô tìm kiếm, web gợi ý “Xu hướng tìm kiếm” (từ khoá khách hay tìm 30 ngày gần đây, cộng từ khoá bạn ghim) và “Thương hiệu nổi bật”." />
      {first(sp.saved) ? <Flash>{first(sp.saved)}</Flash> : null}
      {first(sp.error) ? <Flash kind="error">{first(sp.error)}</Flash> : null}

      <Card className="mb-6" title="Đang hiện cho khách">
        <p className="m-0 mb-2 text-[12px] font-bold uppercase tracking-wide text-lien-muted">Xu hướng tìm kiếm</p>
        <div className="mb-4 flex flex-wrap gap-2" data-testid="preview-trending">
          {live.trending.length ? live.trending.map((x) => <span key={x} className="inline-flex items-center gap-1 rounded-full bg-[#fff1ea] px-3 py-1 text-[13px] text-[#c2410c]"><Fa name="fire" className="text-[11px] text-lien-sale" /> {x}</span>) : <span className="text-[13px] text-lien-muted">Chưa có — sẽ tự có khi khách tìm, hoặc ghim từ khoá bên dưới.</span>}
        </div>
        <p className="m-0 mb-2 text-[12px] font-bold uppercase tracking-wide text-lien-muted">Thương hiệu nổi bật</p>
        <div className="flex flex-wrap gap-2" data-testid="preview-brands">
          {live.brands.map((x) => <span key={x} className="rounded-full bg-[#f3f4f6] px-3 py-1 text-[12px] font-semibold uppercase text-lien-heading">{x}</span>)}
        </div>
      </Card>

      <form action={saveSearchSuggestAction} className="mb-6 grid gap-6 lg:grid-cols-2">
        <Card title="Từ khoá ghim đầu “Xu hướng tìm kiếm”">
          <label className={adminLabel} htmlFor="pinned">
            Mỗi dòng một từ khoá <InfoPopover>Luôn đứng đầu danh sách, trước các từ khoá khách hay tìm. Tối đa khoảng 14 chip hiện cho khách. Để trống thì chỉ dùng từ khoá khách tìm (chưa có thì lấy từ khoá sản phẩm phổ biến).</InfoPopover>
          </label>
          <textarea id="pinned" name="pinned" rows={8} defaultValue={lists.pinned.join("\n")} placeholder={"Kem chống nắng\nDầu gội dầu ngựa\nDHC vitamin C"} className={adminInput} />
        </Card>
        <Card title="Thương hiệu nổi bật">
          <label className={adminLabel} htmlFor="brands">
            Mỗi dòng một thương hiệu <InfoPopover>Bấm chip là tìm theo tên đó. Để trống thì web tự đoán từ tên sản phẩm (danh sách gợi ý bên dưới) — dán vào đây để sửa/sắp lại.</InfoPopover>
          </label>
          <textarea id="brands" name="brands" rows={8} defaultValue={lists.brands.join("\n")} placeholder={guessed.join("\n")} className={adminInput} />
          <p className="m-0 mt-2 text-[12px] leading-5 text-lien-muted">Tự đoán từ tên sản phẩm: {guessed.join(", ") || "—"}</p>
        </Card>
        <div className="lg:col-span-2">
          <button type="submit" className={btnPrimary}>
            <Fa name="check" /> Lưu gợi ý
          </button>
        </div>
      </form>

      <Card title="Khách đã tìm gì (30 ngày)">
        {top.length === 0 ? (
          <p className="m-0 text-[14px] text-lien-muted">Chưa có lượt tìm nào được ghi. Mỗi lần khách tìm ở ô tìm kiếm sẽ được đếm ở đây.</p>
        ) : (
          <table className={tableClass} data-testid="top-terms">
            <thead>
              <tr>
                <th className={thClass}>Từ khoá</th>
                <th className={`${thClass} text-right`}>Lượt tìm</th>
                <th className={thClass}>Trạng thái</th>
                <th className={thClass} />
              </tr>
            </thead>
            <tbody>
              {top.map((x) => (
                <tr key={x.term}>
                  <td className={`${tdClass} font-semibold text-lien-heading`}>{x.term}</td>
                  <td className={`${tdClass} text-right`}>{x.count}</td>
                  <td className={tdClass}>{x.hidden ? <span className="rounded-full bg-gray-200 px-2 py-0.5 text-[11px] font-semibold text-gray-700">Đang ẩn</span> : <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800">Có thể hiện</span>}</td>
                  <td className={`${tdClass} text-right`}>
                    <form action={hideSearchTermAction} className="inline">
                      <input type="hidden" name="term" value={x.term} />
                      <input type="hidden" name="hidden" value={x.hidden ? "0" : "1"} />
                      <button type="submit" className={`${btnSecondary} !px-2.5 !py-1.5 !text-[13px]`}>
                        {x.hidden ? "Hiện lại" : "Ẩn khỏi gợi ý"}
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
