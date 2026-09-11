import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { changePasswordAction, customerLogout, deleteAddressAction, saveAddressAction, setDefaultAddressAction, updateProfile, uploadAvatarAction } from "@/app/my-account/actions";
import { FilePicker } from "@/components/sites/lienstore/admin/FilePicker";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { StoreSidebar } from "@/components/sites/lienstore/shop/cart/StoreSidebar";
import { Price, WooNotice, wooButtonClass, wooInputClass } from "@/components/sites/lienstore/shop/cart/WooUi";
import { SiteChrome, TwoColumnShell } from "@/components/sites/lienstore/shop/SiteChrome";
import { VoucherStrip } from "@/components/sites/lienstore/ui2/VoucherStrip";
import { getCurrentCustomer } from "@/lib/customer-auth";
import { displayEmail } from "@/lib/customer-email";
import { getHomeVouchers, getOrdersForCustomer, listAddresses } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { type I18nKey, t } from "@/lib/i18n";
import { getLang } from "@/lib/lang-server";
import { SHIP_STAGES, stageIndex } from "@/lib/shipping";
import { cn } from "@/lib/utils";
import type { PublicCustomer } from "@/lib/db";
import type { Order } from "@/types/shop";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Trang của tôi" };

type Tab = "overview" | "orders" | "profile" | "account" | "vouchers";
const TABS: Array<{ key: Tab; label: I18nKey; icon: "user-circle" | "shopping-bag" | "pencil" | "shield" | "gift" }> = [
  { key: "overview", label: "myPage", icon: "user-circle" },
  { key: "orders", label: "purchasedTab", icon: "shopping-bag" },
  { key: "profile", label: "profileTab", icon: "pencil" },
  { key: "account", label: "accountSecurityTab", icon: "shield" },
  { key: "vouchers", label: "vouchersTab", icon: "gift" },
];
const LEGACY: Record<string, Tab> = { dashboard: "overview", details: "profile", address: "profile" };

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const LABEL = "mb-1.5 block text-[15px] font-semibold leading-6 text-lien-input-text";
const rowLink = "flex items-center justify-between gap-3 border-b border-lien-line py-3.5 text-[15px] text-lien-heading no-underline hover:text-lien-blue";

function Avatar({ customer, size = 64 }: { customer: PublicCustomer; size?: number }) {
  const name = `${customer.lastName} ${customer.firstName}`.trim() || customer.username || customer.email;
  if (customer.avatar) {
    return <Image src={customer.avatar} alt="" width={size} height={size} unoptimized className="rounded-full border border-lien-line object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <span className="flex items-center justify-center rounded-full bg-lien-blue font-bold text-white" style={{ width: size, height: size, fontSize: size / 2.6 }}>
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/** Customer-facing status of an order: cancelled, or the logistics stage. */
function orderStatus(o: Order, lang: "vi" | "ja"): { text: string; done: boolean } {
  if (o.status === "cancelled") return { text: lang === "ja" ? "キャンセル済み" : "Đã huỷ", done: true };
  const s = SHIP_STAGES[stageIndex(o.shipStage)];
  return { text: lang === "ja" ? t(lang, `stage_${s.key}` as I18nKey) : s.label, done: s.key === "delivered" };
}

export default async function MyAccount({ searchParams }: Props) {
  const lang = await getLang();
  const customer = await getCurrentCustomer();
  // Signing in happens in the header drawer everywhere; this page only has content for signed-in customers.
  if (!customer) redirect("/?login=1");
  const sp = await searchParams;
  const tabRaw = first(sp.tab);
  const tab: Tab = TABS.some((x) => x.key === tabRaw) ? (tabRaw as Tab) : (LEGACY[tabRaw] ?? "overview");
  // legacy deep links to one order → the order page
  if (tab === "orders" && first(sp.view)) redirect(`/checkout/order-received/${encodeURIComponent(first(sp.view))}/`);
  const [orders, addresses] = await Promise.all([getOrdersForCustomer({ id: customer.id, email: customer.email }), listAddresses(customer.id)]);
  const name = `${customer.lastName} ${customer.firstName}`.trim() || customer.username || displayEmail(customer.email);
  const activeOnly = first(sp.active) === "1";
  const saved = first(sp.saved);
  const error = first(sp.error);
  const editId = Number.parseInt(first(sp.edit), 10);
  const editing = addresses.find((a) => a.id === editId) ?? null;

  return (
    <SiteChrome>
      <TwoColumnShell sidebar={<StoreSidebar />} title={t(lang, "myPage")}>
        <article className="entry-content">
          <div className="sm:flex sm:gap-8">
            {/* ---- left menu (Mercari マイページ) ---- */}
            <nav className="mb-6 sm:w-[30%]" aria-label={t(lang, "myPage")}>
              <div className="mb-3 flex items-center gap-3 px-1">
                <Avatar customer={customer} size={48} />
                <span className="min-w-0">
                  <strong className="block truncate text-[15px] text-lien-heading">{name}</strong>
                  {customer.username ? <span className="block text-[12px] text-lien-muted">ID: {customer.username}</span> : null}
                </span>
              </div>
              <ul className="m-0 list-none border-t border-lien-line p-0">
                {TABS.map((x) => (
                  <li key={x.key} className="border-b border-lien-line">
                    <Link href={x.key === "overview" ? "/my-account/" : `/my-account/?tab=${x.key}`} className={cn("flex items-center justify-between px-2 py-3 text-[15px] no-underline", tab === x.key ? "bg-lien-blue-soft/70 font-bold text-lien-blue" : "text-lien-text hover:text-lien-blue")}>
                      <span className="flex items-center gap-2">
                        <Fa name={x.icon} className="w-4 text-center text-lien-muted" />
                        {t(lang, x.label)}
                      </span>
                      <Fa name="angle-right" className="text-[12px] text-lien-muted" />
                    </Link>
                  </li>
                ))}
                <li className="border-b border-lien-line">
                  <Link href="/wishlist/" className="flex items-center justify-between px-2 py-3 text-[15px] text-lien-text no-underline hover:text-lien-blue">
                    <span className="flex items-center gap-2">
                      <Fa name="heart-o" className="w-4 text-center text-lien-muted" />
                      {t(lang, "wishlist")}
                    </span>
                    <Fa name="angle-right" className="text-[12px] text-lien-muted" />
                  </Link>
                </li>
                <li className="border-b border-lien-line">
                  <form action={customerLogout}>
                    <button type="submit" className="flex w-full items-center gap-2 px-2 py-3 text-left text-[15px] text-lien-blue hover:underline">
                      <Fa name="sign-out" className="w-4 text-center" />
                      {t(lang, "logout")}
                    </button>
                  </form>
                </li>
              </ul>
            </nav>

            {/* ---- content ---- */}
            <div className="min-w-0 flex-1">
              {saved ? <WooNotice kind="message">{saved}</WooNotice> : null}
              {error ? <WooNotice kind="error">{error}</WooNotice> : null}

              {tab === "overview" ? (
                <>
                  <div className="mb-6 flex items-center gap-4">
                    <Avatar customer={customer} size={72} />
                    <div>
                      <h2 className="m-0 text-[22px] font-bold text-lien-heading">{name}</h2>
                      <p className="m-0 text-[13px] text-lien-muted">
                        {customer.username ? `ID: ${customer.username} · ` : ""}
                        {displayEmail(customer.email) || "chưa có email"}
                        {customer.phone ? ` · ${customer.phone}` : ""}
                      </p>
                    </div>
                  </div>
                  <ul className="m-0 list-none border-t border-lien-line p-0">
                    <li>
                      <Link href="/my-account/?tab=orders" className={rowLink}>
                        <span>
                          {t(lang, "purchasedTab")} <span className="text-[13px] font-normal text-lien-muted">({orders.length})</span>
                        </span>
                        <Fa name="angle-right" className="text-lien-muted" />
                      </Link>
                    </li>
                    <li>
                      <Link href="/my-account/?tab=orders&active=1" className={rowLink}>
                        <span>
                          {t(lang, "activeOrdersOnly")} <span className="text-[13px] font-normal text-lien-muted">({orders.filter((o) => !orderStatus(o, lang).done).length})</span>
                        </span>
                        <Fa name="angle-right" className="text-lien-muted" />
                      </Link>
                    </li>
                    <li>
                      <Link href="/my-account/?tab=profile" className={rowLink}>
                        <span>
                          {t(lang, "profileTab")} <span className="text-[13px] font-normal text-lien-muted">({addresses.length} {lang === "ja" ? "住所" : "địa chỉ"})</span>
                        </span>
                        <Fa name="angle-right" className="text-lien-muted" />
                      </Link>
                    </li>
                    <li>
                      <Link href="/my-account/?tab=account" className={rowLink}>
                        <span>{t(lang, "accountSecurityTab")}</span>
                        <Fa name="angle-right" className="text-lien-muted" />
                      </Link>
                    </li>
                    <li>
                      <Link href="/my-account/?tab=vouchers" className={rowLink}>
                        <span>{t(lang, "vouchersTab")}</span>
                        <Fa name="angle-right" className="text-lien-muted" />
                      </Link>
                    </li>
                    <li>
                      <Link href="/wishlist/" className={rowLink}>
                        <span>{t(lang, "wishlist")}</span>
                        <Fa name="angle-right" className="text-lien-muted" />
                      </Link>
                    </li>
                  </ul>
                </>
              ) : null}

              {tab === "orders" ? (
                <>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                    <h2 className="m-0 text-[20px] font-bold text-lien-heading">{t(lang, "purchasedTab")}</h2>
                    <Link href={activeOnly ? "/my-account/?tab=orders" : "/my-account/?tab=orders&active=1"} className="inline-flex items-center gap-2 text-[14px] text-lien-text no-underline hover:text-lien-blue">
                      <span className={cn("flex h-[18px] w-[18px] items-center justify-center rounded border", activeOnly ? "border-lien-blue bg-lien-blue text-white" : "border-[#9ca3af] bg-white")}>{activeOnly ? <Fa name="check" className="text-[11px]" /> : null}</span>
                      {t(lang, "activeOrdersOnly")}
                    </Link>
                  </div>
                  {(() => {
                    const list = orders.filter((o) => !activeOnly || !orderStatus(o, lang).done);
                    if (list.length === 0) {
                      return (
                        <WooNotice
                          kind="info"
                          action={
                            <Link href="/shop/" className={wooButtonClass}>
                              {t(lang, "shopNow")}
                            </Link>
                          }
                        >
                          {t(lang, "noOrders")}
                        </WooNotice>
                      );
                    }
                    return (
                      <ul className="m-0 list-none border-t border-lien-line p-0">
                        {list.map((o) => {
                          const st = orderStatus(o, lang);
                          const it = o.items[0];
                          const more = o.items.length - 1;
                          return (
                            <li key={o.id} className="border-b border-lien-line">
                              <Link href={`/checkout/order-received/${o.id}/`} className="flex items-center gap-4 py-3 text-lien-text no-underline hover:bg-lien-cream/60">
                                {it?.image ? <Image src={it.image} alt="" width={64} height={64} unoptimized className="h-16 w-16 shrink-0 rounded border border-lien-line object-cover" /> : <span className="h-16 w-16 shrink-0 rounded border border-lien-line bg-lien-cream" />}
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-[15px] text-lien-heading">
                                    {it?.name ?? `#${o.number}`}
                                    {more > 0 ? <span className="text-lien-muted"> {lang === "ja" ? `他${more}点` : `và ${more} sản phẩm khác`}</span> : null}
                                  </span>
                                  <span className="mt-0.5 block text-[12px] text-lien-muted">
                                    #{o.number} · <Fa name="clock-o" /> {formatDateTime(o.createdAt)} · <Price value={o.total} currency={o.currency} />
                                  </span>
                                  <span className={cn("mt-0.5 block text-[12px] font-semibold", o.status === "cancelled" ? "text-[#842029]" : st.done ? "text-lien-success" : "text-lien-blue")}>{st.text}</span>
                                </span>
                                <Fa name="angle-right" className="shrink-0 text-lien-muted" />
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    );
                  })()}
                </>
              ) : null}

              {tab === "profile" ? (
                <>
                  <h2 className="m-0 mb-4 text-[20px] font-bold text-lien-heading">{t(lang, "profileTab")}</h2>
                  <form action={updateProfile} className="mb-8 rounded-md border border-lien-line bg-white p-4 sm:p-5">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <p className="m-0">
                        <label htmlFor="last_name" className={LABEL}>
                          Họ và tên đệm
                        </label>
                        <input id="last_name" name="last_name" defaultValue={customer.lastName} className={wooInputClass} />
                      </p>
                      <p className="m-0">
                        <label htmlFor="first_name" className={LABEL}>
                          Tên
                        </label>
                        <input id="first_name" name="first_name" defaultValue={customer.firstName} className={wooInputClass} />
                      </p>
                      <p className="m-0">
                        <label htmlFor="email" className={LABEL}>
                          Email <span className="font-normal text-lien-muted">(tuỳ chọn)</span>
                        </label>
                        <input id="email" name="email" type="email" defaultValue={displayEmail(customer.email)} placeholder="ban@example.com" className={wooInputClass} />
                      </p>
                      <p className="m-0">
                        <label htmlFor="phone" className={LABEL}>
                          Số điện thoại
                        </label>
                        <input id="phone" name="phone" type="tel" inputMode="numeric" defaultValue={customer.phone} placeholder="0912345678" className={wooInputClass} />
                      </p>
                    </div>
                    <button type="submit" className={cn(wooButtonClass, "mt-4")}>
                      Lưu thông tin
                    </button>
                  </form>

                  <h3 className="m-0 mb-1 text-[17px] font-bold text-lien-heading">Địa chỉ nhận hàng</h3>
                  <p className="m-0 mb-3 text-[14px] leading-6 text-lien-muted">Lưu nhiều địa chỉ (nhà, công ty…) để chọn nhanh khi thanh toán. Địa chỉ mặc định được điền sẵn ở trang thanh toán.</p>
                  {addresses.length ? (
                    <ul className="m-0 mb-5 list-none space-y-2 p-0">
                      {addresses.map((a, i) => (
                        <li key={a.id} className={cn("rounded-md border bg-white p-3 sm:p-4", a.isDefault ? "border-lien-blue" : "border-lien-line")}>
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="m-0 text-[15px] font-semibold text-lien-heading">
                                {a.label || `Địa chỉ ${i + 1}`}
                                {a.isDefault ? <span className="ml-2 rounded bg-lien-blue px-1.5 py-px text-[10px] font-bold uppercase text-white">mặc định</span> : null}
                              </p>
                              <p className="m-0 text-[14px] leading-6 text-lien-text">{a.address}</p>
                              <p className="m-0 text-[12px] text-lien-muted">{[a.name, a.phone].filter(Boolean).join(" · ")}</p>
                            </div>
                            <div className="flex flex-wrap gap-2 text-[13px]">
                              <Link href={`/my-account/?tab=profile&edit=${a.id}#address-form`} className="rounded border border-lien-line px-2.5 py-1 text-lien-text no-underline hover:border-lien-blue hover:text-lien-blue">
                                Sửa
                              </Link>
                              {!a.isDefault ? (
                                <form action={setDefaultAddressAction}>
                                  <input type="hidden" name="id" value={a.id} />
                                  <button type="submit" className="rounded border border-lien-line px-2.5 py-1 text-lien-text hover:border-lien-blue hover:text-lien-blue">
                                    Đặt mặc định
                                  </button>
                                </form>
                              ) : null}
                              <form action={deleteAddressAction}>
                                <input type="hidden" name="id" value={a.id} />
                                <button type="submit" className="rounded border border-lien-line px-2.5 py-1 text-[#b81c23] hover:border-[#b81c23]">
                                  Xoá
                                </button>
                              </form>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <WooNotice kind="info">Chưa có địa chỉ nào. Thêm địa chỉ đầu tiên bên dưới.</WooNotice>
                  )}
                  <form id="address-form" action={saveAddressAction} className="rounded-md border border-dashed border-lien-blue/50 bg-lien-blue-soft/40 p-4 sm:p-5">
                    <h4 className="m-0 mb-3 text-[15px] font-bold text-lien-heading">{editing ? `Sửa: ${editing.label}` : "Thêm địa chỉ mới"}</h4>
                    {editing ? <input type="hidden" name="id" value={editing.id} /> : null}
                    <div className="grid gap-3 sm:grid-cols-2">
                      <p className="m-0">
                        <label htmlFor="addr_label" className={LABEL}>
                          Tên gợi nhớ
                        </label>
                        <input id="addr_label" name="label" defaultValue={editing?.label ?? ""} placeholder={`VD: Nhà riêng, Công ty (mặc định: Địa chỉ ${addresses.length + 1})`} className={wooInputClass} />
                      </p>
                      <p className="m-0">
                        <label htmlFor="addr_name" className={LABEL}>
                          Người nhận
                        </label>
                        <input id="addr_name" name="name" defaultValue={editing?.name ?? name} className={wooInputClass} />
                      </p>
                      <p className="m-0">
                        <label htmlFor="addr_phone" className={LABEL}>
                          Điện thoại người nhận
                        </label>
                        <input id="addr_phone" name="phone" type="tel" inputMode="numeric" defaultValue={editing?.phone ?? customer.phone} className={wooInputClass} />
                      </p>
                      <p className="m-0 sm:col-span-2">
                        <label htmlFor="addr_address" className={LABEL}>
                          Địa chỉ đầy đủ
                        </label>
                        <input id="addr_address" name="address" defaultValue={editing?.address ?? ""} placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành" required className={wooInputClass} />
                      </p>
                    </div>
                    <label className="mt-3 inline-flex items-center gap-2 text-[14px] text-lien-text">
                      <input type="checkbox" name="is_default" defaultChecked={editing ? editing.isDefault : addresses.length === 0} className="h-4 w-4" /> Dùng làm địa chỉ mặc định
                    </label>
                    <div className="mt-4 flex flex-wrap gap-2">
                      <button type="submit" className={wooButtonClass}>
                        {editing ? "Lưu địa chỉ" : "Thêm địa chỉ"}
                      </button>
                      {editing ? (
                        <Link href="/my-account/?tab=profile" className="inline-flex items-center rounded-full border border-lien-line bg-white px-4 text-[13px] font-semibold text-lien-text no-underline hover:border-lien-blue">
                          Huỷ
                        </Link>
                      ) : null}
                    </div>
                  </form>
                </>
              ) : null}

              {tab === "account" ? (
                <>
                  <h2 className="m-0 mb-4 text-[20px] font-bold text-lien-heading">{t(lang, "accountSecurityTab")}</h2>
                  <form action={uploadAvatarAction} className="mb-6 rounded-md border border-lien-line bg-white p-4 sm:p-5">
                    <h3 className="m-0 mb-3 text-[15px] font-bold text-lien-heading">Ảnh đại diện</h3>
                    <div className="flex flex-wrap items-center gap-4">
                      <Avatar customer={customer} size={80} />
                      <div className="space-y-2">
                        <FilePicker name="avatar" accept="image/jpeg,image/png,image/webp" label="Chọn ảnh" />
                        <div className="flex gap-2">
                          <button type="submit" className={wooButtonClass}>
                            Lưu ảnh
                          </button>
                          {customer.avatar ? (
                            <button type="submit" name="remove" value="1" className="rounded-full border border-lien-line bg-white px-4 text-[13px] font-semibold text-lien-text hover:border-lien-blue">
                              Bỏ ảnh
                            </button>
                          ) : null}
                        </div>
                        <p className="m-0 text-[12px] text-lien-muted">JPG, PNG hoặc WebP, tối đa 3 MB. Ảnh vuông hiển thị đẹp nhất.</p>
                      </div>
                    </div>
                  </form>
                  <form action={changePasswordAction} className="rounded-md border border-lien-line bg-white p-4 sm:p-5">
                    <h3 className="m-0 mb-3 text-[15px] font-bold text-lien-heading">Đổi mật khẩu</h3>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <p className="m-0">
                        <label htmlFor="password_current" className={LABEL}>
                          Mật khẩu hiện tại
                        </label>
                        <input id="password_current" name="password_current" type="password" autoComplete="current-password" required className={wooInputClass} />
                      </p>
                      <p className="m-0">
                        <label htmlFor="password_1" className={LABEL}>
                          Mật khẩu mới
                        </label>
                        <input id="password_1" name="password_1" type="password" autoComplete="new-password" required minLength={6} className={wooInputClass} />
                      </p>
                      <p className="m-0">
                        <label htmlFor="password_2" className={LABEL}>
                          Nhập lại mật khẩu mới
                        </label>
                        <input id="password_2" name="password_2" type="password" autoComplete="new-password" required minLength={6} className={wooInputClass} />
                      </p>
                    </div>
                    <button type="submit" className={cn(wooButtonClass, "mt-4")}>
                      Đổi mật khẩu
                    </button>
                  </form>
                  <p className="mt-4 text-[13px] text-lien-muted">
                    Đăng nhập bằng {customer.username ? <>ID <strong>{customer.username}</strong></> : null}
                    {customer.username && displayEmail(customer.email) ? " hoặc " : ""}
                    {displayEmail(customer.email) ? <>email <strong>{displayEmail(customer.email)}</strong></> : null}. Mã khách hàng: {customer.customerNo ?? "—"}.
                  </p>
                </>
              ) : null}

              {tab === "vouchers" ? (
                <>
                  <h2 className="m-0 mb-2 text-[20px] font-bold text-lien-heading">{t(lang, "vouchersTab")}</h2>
                  <p className="mb-4 text-[15px] leading-6 text-lien-muted">Mã tặng riêng cho tài khoản này và các ưu đãi đang chạy trên website. Nhập mã ở trang thanh toán.</p>
                  {(await getHomeVouchers(customer.id)).length ? (
                    <VoucherStrip className="!my-0" vouchers={(await getHomeVouchers(customer.id)).map((v) => ({ code: v.code, kind: v.kind, value: v.value, minSubtotal: v.minSubtotal, maxDiscount: v.maxDiscount, endsAt: v.endsAt, personal: v.personal, note: v.note }))} />
                  ) : (
                    <WooNotice kind="info">Hiện chưa có voucher nào dành cho bạn.</WooNotice>
                  )}
                </>
              ) : null}
            </div>
          </div>
        </article>
      </TwoColumnShell>
    </SiteChrome>
  );
}
