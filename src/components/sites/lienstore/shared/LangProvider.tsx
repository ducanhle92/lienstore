"use client";

import { createContext, useContext, type ReactNode } from "react";
import { t as translate, type I18nKey, type Lang } from "@/lib/i18n";

const LangContext = createContext<Lang>("vi");

export function LangProvider({ lang, children }: { lang: Lang; children: ReactNode }) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

/** Current chrome language + translator for client components. */
export function useLang(): { lang: Lang; t: (key: I18nKey) => string } {
  const lang = useContext(LangContext);
  return { lang, t: (key) => translate(lang, key) };
}
