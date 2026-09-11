"use client";

import { useActionState, useId, useState, type ReactNode } from "react";
import { submitReviewAction, type ReviewFormState } from "@/app/product/actions";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { openAccountDrawer } from "@/components/sites/lienstore/shared/open-account";
import { useLang } from "@/components/sites/lienstore/shared/LangProvider";
import { StarRating } from "@/components/sites/lienstore/shop/StarRating";
import { formatDateTime } from "@/lib/format";
import { maskReviewer } from "@/lib/reviews";
import { cn } from "@/lib/utils";
import type { ProductReview } from "@/types/shop";
import { ProductDescription } from "./ProductDescription";

interface ProductTabsProps {
  name: string;
  productId: number;
  /** Sanitised HTML description. */
  description: string;
  /** Approved reviews, newest first. */
  reviews: ProductReview[];
  /** Account name of the signed-in customer (null when signed out). */
  reviewer: string | null;
  /** Optional extra panel (unused by default). */
  shipping?: ReactNode;
}

type TabKey = "description" | "shipping" | "reviews";

const H2 = "sr-only";
const FIELD =
  "box-border w-full rounded-[3px] border border-lien-input-border bg-white p-[5px] font-arial text-[16px] leading-6 text-lien-input-text focus:border-lien-blue focus:outline-none";
const REQUIRED = <span className="required text-[#e2401c]">*</span>;

/** `.woocommerce-tabs`: "Thông tin sản phẩm" / "Đánh giá (n)" tabs with the grey tab strip. */
export function ProductTabs({ name, productId, description, reviews, reviewer, shipping }: ProductTabsProps) {
  const [tab, setTab] = useState<TabKey>("description");
  const base = useId();
  const { t } = useLang();

  const tabs: { key: TabKey; label: string }[] = [
    { key: "description", label: t("tabInfo") },
    ...(shipping ? [{ key: "shipping" as TabKey, label: t("tabShipping") }] : []),
    { key: "reviews", label: `${t("tabReviews")} (${reviews.length})` },
  ];

  return (
    <div className="woocommerce-tabs wc-tabs-wrapper clear-both rounded-md bg-lien-cream/60 px-4 py-6 sm:px-8">
      <ul role="tablist" className="tabs wc-tabs m-0 mb-6 flex list-none flex-wrap justify-center gap-2 p-0">
        {tabs.map(({ key, label }) => {
          const active = tab === key;
          return (
            <li key={key} role="presentation" className={cn("inline-block rounded-full border", active ? "border-lien-heading bg-white" : "border-transparent bg-transparent")}>
              <button
                type="button"
                role="tab"
                id={`${base}-tab-${key}`}
                aria-selected={active}
                aria-controls={`${base}-panel-${key}`}
                onClick={() => setTab(key)}
                className={cn(
                  "inline-block cursor-pointer border-0 bg-transparent px-5 py-2 text-[13px] font-semibold uppercase tracking-[0.3px] leading-5 no-underline",
                  active ? "text-lien-heading" : "text-lien-muted hover:text-lien-heading",
                )}
              >
                {label}
              </button>
            </li>
          );
        })}
      </ul>

      {tab === "description" ? (
        <div role="tabpanel" id={`${base}-panel-description`} aria-labelledby={`${base}-tab-description`} className="woocommerce-Tabs-panel woocommerce-Tabs-panel--description panel entry-content mb-8">
          <h2 className={H2}>Mô tả</h2>
          <ProductDescription name={name} description={description} />
        </div>
      ) : tab === "shipping" ? (
        <div role="tabpanel" id={`${base}-panel-shipping`} aria-labelledby={`${base}-tab-shipping`} className="panel mb-8">
          <h2 className={H2}>Chi phí vận chuyển</h2>
          {shipping}
        </div>
      ) : (
        <div role="tabpanel" id={`${base}-panel-reviews`} aria-labelledby={`${base}-tab-reviews`} className="woocommerce-Tabs-panel woocommerce-Tabs-panel--reviews panel entry-content mb-8">
          <h2 className={H2}>{t("tabReviews")}</h2>
          {reviews.length ? (
            <>
              {(() => {
                const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
                const dist = [5, 4, 3, 2, 1].map((n) => ({ n, c: reviews.filter((r) => r.rating === n).length }));
                return (
                  <div className="mb-6 grid gap-6 rounded-md border border-lien-line bg-white p-4 sm:grid-cols-[220px_1fr]">
                    <div>
                      <div className="flex items-end gap-2">
                        <span className="text-[40px] font-bold leading-none text-lien-heading">{avg.toFixed(1)}</span>
                        <span className="pb-1 text-[14px] text-lien-muted">{t("outOf5")}</span>
                      </div>
                      <StarRating rating={Math.round(avg)} />
                      <p className="m-0 mt-1 text-[13px] text-lien-muted">
                        {reviews.length} {t("ratingsCount")}
                      </p>
                    </div>
                    <ul className="m-0 list-none space-y-1.5 p-0">
                      {dist.map(({ n, c }) => (
                        <li key={n} className="flex items-center gap-3 text-[13px]">
                          <span className="w-10 whitespace-nowrap text-lien-blue">{n} ★</span>
                          <span className="h-3 flex-1 overflow-hidden rounded bg-lien-cream">
                            <span className="block h-full rounded bg-lien-amber" style={{ width: `${(c / reviews.length) * 100}%` }} />
                          </span>
                          <span className="w-10 text-right text-lien-muted">{Math.round((c / reviews.length) * 100)}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}
              <ol className="m-0 mb-8 grid list-none gap-3 p-0">
                {reviews.map((r) => (
                  <li key={r.id} className="rounded-md border border-lien-line bg-white px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-lien-blue text-[12px] font-bold text-white">{(r.author.trim()[0] ?? "?").toUpperCase()}</span>
                      <span className="text-[14px] font-semibold text-lien-heading">{maskReviewer(r.author)}</span>
                      {r.verified ? (
                        <span className="rounded-full bg-lien-blue-soft px-2 py-px text-[11px] font-semibold text-lien-blue">
                          <Fa name="check-circle" /> {t("verifiedBuyer")}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                      <StarRating rating={r.rating} />
                      <span className="text-[12px] text-lien-muted">{formatDateTime(r.createdAt)}</span>
                    </div>
                    <p className="m-0 mt-2 whitespace-pre-line text-[15px] leading-6 text-lien-text">{r.comment}</p>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <p className="woocommerce-noreviews mb-4 text-[16px] leading-6 text-lien-text">{t("noReviews")}</p>
          )}
          <ReviewForm name={name} productId={productId} reviewer={reviewer} />
        </div>
      )}
    </div>
  );
}

const RATING_LABELS = ["Rất tệ", "Tệ", "Bình thường", "Tốt", "Rất tốt"];

/** Review form for signed-in customers: stars + comment only; the account name is taken from the session. */
function ReviewForm({ name, productId, reviewer }: { name: string; productId: number; reviewer: string | null }) {
  const id = useId();
  const { t, lang } = useLang();
  const ratingLabels = lang === "ja" ? ["とても悪い", "悪い", "普通", "良い", "とても良い"] : RATING_LABELS;
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [state, action, pending] = useActionState<ReviewFormState, FormData>(submitReviewAction, null);

  if (!reviewer) {
    return (
      <p className="rounded-md border border-lien-line bg-white px-4 py-3 text-[15px] leading-6 text-lien-text">
        <Fa name="user" className="mr-2 text-lien-blue" />
        {t("reviewLogin")}{" "}
        <button type="button" onClick={() => openAccountDrawer("login")} className="font-semibold text-lien-blue hover:underline">
          {t("login")}
        </button>
      </p>
    );
  }

  if (state && "ok" in state) {
    return (
      <p role="status" className="woocommerce-message relative mb-8 border-t-[3px] border-[#8fae1b] bg-[#f7f6f7] px-8 py-4 text-[16px] leading-6 text-[#515151]">
        {t("reviewThanks")}
      </p>
    );
  }

  const shown = hover || rating;
  const error = state && "error" in state ? state.error : null;

  return (
    <div id="review_form_wrapper" className="max-w-[760px]">
      <h3 className="comment-reply-title mb-4 text-[16px] leading-6 font-bold text-lien-text">
        {t("reviewFirst")} &ldquo;{name}&rdquo;
      </h3>
      <form id="commentform" className="comment-form" action={action}>
        <input type="hidden" name="productId" value={productId} />
        <p className="comment-notes mb-4 text-[14px] leading-5 text-lien-muted">
          {t("reviewPostAs")}: <strong className="text-lien-heading">{maskReviewer(reviewer)}</strong> {t("reviewMasked")}
        </p>

        <fieldset className="comment-form-rating mb-4 border-0 p-0">
          <legend className="mb-1 text-[16px] leading-6 text-lien-text">
            {t("yourRating")} {REQUIRED}
          </legend>
          <div className="stars flex gap-0.5" onMouseLeave={() => setHover(0)}>
            {ratingLabels.map((label, i) => {
              const value = i + 1;
              return (
                <label key={value} className="cursor-pointer" onMouseEnter={() => setHover(value)}>
                  <input type="radio" name="rating" value={value} checked={rating === value} onChange={() => setRating(value)} className="sr-only" />
                  <Fa name={value <= shown ? "star" : "star-o"} label={`${value} ${t("star")} – ${label}`} className="text-[18px] leading-[18px] text-lien-blue" />
                </label>
              );
            })}
          </div>
        </fieldset>

        <p className="comment-form-comment mb-4">
          <label htmlFor={`${id}-comment`} className="mb-1 block text-[16px] leading-6 text-lien-text">
            {t("yourReview")} {REQUIRED}
          </label>
          <textarea id={`${id}-comment`} name="comment" rows={6} required minLength={5} maxLength={2000} className={FIELD} />
        </p>

        {error ? <p className="mb-3 text-[14px] leading-5 text-[#e2401c]">{error}</p> : null}

        <p className="form-submit">
          <button
            type="submit"
            disabled={pending}
            className="submit inline-block cursor-pointer rounded-[3px] border-0 bg-lien-blue px-4 py-[9.888px] font-arial text-[16px] leading-4 font-bold text-white transition-[background] duration-200 hover:bg-lien-blue-hover disabled:opacity-60"
          >
            {t("submit")}
          </button>
        </p>
      </form>
    </div>
  );
}
