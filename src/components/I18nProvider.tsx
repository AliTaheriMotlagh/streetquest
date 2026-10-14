"use client";
// Browser half of i18n. The root layout renders <I18nProvider locale=…> with the
// language the server picked. In the browser that language is fixed for the page's
// life (switching reloads), so plain t() works anywhere — event handlers, effects,
// helpers. Components that are also rendered on the server should use useT(): on the
// server many requests share this module, and only the context knows which request
// is which.
import { createContext, use, useCallback, useContext } from "react";
import { DEFAULT_LOCALE, isLocale, setLocaleResolver, translate, type Locale, type Vars } from "@/lib/i18n";
import { catalogSettled, loadCatalog } from "@/lib/i18n/load";

const LocaleCtx = createContext<Locale>(DEFAULT_LOCALE);

let current: Locale = DEFAULT_LOCALE;
if (typeof document !== "undefined" && isLocale(document.documentElement.lang)) current = document.documentElement.lang;
setLocaleResolver(() => current);

export function I18nProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  current = locale;
  // Hold rendering (hydration keeps the server's HTML on screen) until the messages
  // are in, so the page never flashes English first.
  if (!catalogSettled(locale)) use(loadCatalog(locale));
  return <LocaleCtx.Provider value={locale}>{children}</LocaleCtx.Provider>;
}

export const useLocale = () => useContext(LocaleCtx);

/** t() bound to this render's language — safe in server-rendered client components. */
export function useT() {
  const locale = useLocale();
  return useCallback((message: string, vars?: Vars) => translate(locale, message, vars), [locale]);
}
