"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Fa } from "@/components/sites/lienstore/shared/icons";
import { useLang } from "@/components/sites/lienstore/shared/LangProvider";
import { ProductDescription } from "./ProductDescription";
import { cn } from "@/lib/utils";

interface ProductTabsProps {
  name: string;
  /** Sanitised HTML description. */
  description: string;
  reviewCount: number;
  /** Server-rendered shipping fee tables (ShippingTable). */
  shipping?: ReactNode;
}

type TabKey = "description" | "shipping" | "reviews";

const H2 = "sr-only";
const FIELD =
  "box-border w-full rounded-[3px] border border-lien-input-border bg-white p-[5px] font-arial text-[16px] leading-6 text-lien-input-text focus:border-lien-blue focus:outline-none";
const REQUIRED = <span className="required text-[#e2401c]">*</span>;

/** `.woocommerce-tabs`: "Mô tả" / "Đánh giá (n)" tabs with the WooCommerce grey tab strip. */
export function ProductTabs({ name, description, reviewCount, shipping }: ProductTabsProps) {
  const [tab, setTab] = useState<TabKey>("description");
  const base = useId();
  const { t } = useLang();

  const tabs: { key: TabKey; label: string }[] = [
    { key: "description", label: t("tabInfo") },
    ...(shipping ? [{ key: "shipping" as TabKey, label: t("tabShipping") }] : []),
    { key: "reviews", label: `${t("tabReviews")} (${reviewCount})` },
  ];

  return (
    <div className="woocommerce-tabs wc-tabs-wrapper clear-both rounded-md bg-lien-cream/60 px-4 py-6 sm:px-8">
      <ul
        role="tablist"
        className="tabs wc-tabs m-0 mb-6 flex list-none flex-wrap justify-center gap-2 p-0"
      >
        {tabs.map(({ key, label }) => {
          const active = tab === key;
          return (
            <li
              key={key}
              role="presentation"
              className={cn("inline-block rounded-full border", active ? "border-lien-heading bg-white" : "border-transparent bg-transparent")}
            >
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
        <div
          role="tabpanel"
          id={`${base}-panel-description`}
          aria-labelledby={`${base}-tab-description`}
          className="woocommerce-Tabs-panel woocommerce-Tabs-panel--description panel entry-content mb-8"
        >
          <h2 className={H2}>Mô tả</h2>
          <ProductDescription name={name} description={description} />
        </div>
      ) : tab === "shipping" ? (
        <div role="tabpanel" id={`${base}-panel-shipping`} aria-labelledby={`${base}-tab-shipping`} className="panel mb-8">
          <h2 className={H2}>Chi phí vận chuyển</h2>
          {shipping}
        </div>
      ) : (
        <div
          role="tabpanel"
          id={`${base}-panel-reviews`}
          aria-labelledby={`${base}-tab-reviews`}
          className="woocommerce-Tabs-panel woocommerce-Tabs-panel--reviews panel entry-content mb-8"
        >
          <h2 className={H2}>Đánh giá</h2>
          <p className="woocommerce-noreviews mb-4 text-[16px] leading-6 text-lien-text">{t("noReviews")}</p>
          <ReviewForm name={name} />
        </div>
      )}
    </div>
  );
}

const RATING_LABELS = ["Rất tệ", "Tệ", "Bình thường", "Tốt", "Rất tốt"];

/** WooCommerce review form; purely client-side (no backend) — submitting shows a "pending moderation" notice. */
function ReviewForm({ name }: { name: string }) {
  const id = useId();
  const { t, lang } = useLang();
  const ratingLabels = lang === "ja" ? ["とても悪い", "悪い", "普通", "良い", "とても良い"] : RATING_LABELS;
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (rating === 0) {
      setError(t("pickStars"));
      return;
    }
    setError(null);
    setSent(true);
  };

  if (sent) {
    return (
      <p
        role="status"
        className="woocommerce-message relative mb-8 border-t-[3px] border-[#8fae1b] bg-[#f7f6f7] px-8 py-4 text-[16px] leading-6 text-[#515151]"
      >
        {t("reviewThanks")}
      </p>
    );
  }

  const shown = hover || rating;

  return (
    <div id="review_form_wrapper" className="max-w-[760px]">
      <h3 className="comment-reply-title mb-4 text-[16px] leading-6 font-bold text-lien-text">
        {t("reviewFirst")} &ldquo;{name}&rdquo;
      </h3>
      <form id="commentform" className="comment-form" onSubmit={onSubmit}>
        <p className="comment-notes mb-4 text-[14px] leading-5 text-lien-muted">
          {t("reviewNotes")} {REQUIRED}
        </p>

        <fieldset className="comment-form-rating mb-4 border-0 p-0">
          <legend className="mb-1 text-[16px] leading-6 text-lien-text">{t("yourRating")} {REQUIRED}</legend>
          <div className="stars flex gap-0.5" onMouseLeave={() => setHover(0)}>
            {ratingLabels.map((label, i) => {
              const value = i + 1;
              return (
                <label key={value} className="cursor-pointer" onMouseEnter={() => setHover(value)}>
                  <input
                    type="radio"
                    name="rating"
                    value={value}
                    checked={rating === value}
                    onChange={() => setRating(value)}
                    className="sr-only"
                  />
                  <Fa
                    name={value <= shown ? "star" : "star-o"}
                    label={`${value} ${t("star")} – ${label}`}
                    className="text-[18px] leading-[18px] text-lien-blue"
                  />
                </label>
              );
            })}
          </div>
          {error ? <p className="mt-1 text-[14px] leading-5 text-[#e2401c]">{error}</p> : null}
        </fieldset>

        <p className="comment-form-comment mb-4">
          <label htmlFor={`${id}-comment`} className="mb-1 block text-[16px] leading-6 text-lien-text">
            {t("yourReview")} {REQUIRED}
          </label>
          <textarea id={`${id}-comment`} name="comment" rows={6} required className={FIELD} />
        </p>

        <div className="sm:flex sm:gap-4">
          <p className="comment-form-author mb-4 sm:flex-1">
            <label htmlFor={`${id}-author`} className="mb-1 block text-[16px] leading-6 text-lien-text">
              {t("name")} {REQUIRED}
            </label>
            <input id={`${id}-author`} name="author" type="text" required autoComplete="name" className={FIELD} />
          </p>
          <p className="comment-form-email mb-4 sm:flex-1">
            <label htmlFor={`${id}-email`} className="mb-1 block text-[16px] leading-6 text-lien-text">
              Email {REQUIRED}
            </label>
            <input id={`${id}-email`} name="email" type="email" required autoComplete="email" className={FIELD} />
          </p>
        </div>

        <p className="form-submit">
          <button
            type="submit"
            className="submit inline-block cursor-pointer rounded-[3px] border-0 bg-lien-blue px-4 py-[9.888px] font-arial text-[16px] leading-4 font-bold text-white transition-[background] duration-200 hover:bg-lien-blue-hover"
          >
            {t("submit")}
          </button>
        </p>
      </form>
    </div>
  );
}
