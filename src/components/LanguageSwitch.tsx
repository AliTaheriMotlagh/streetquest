"use client";
// Pick the UI language. The choice lives in a cookie (pages and API read it) and on
// the player's account (notifications and pushes are written in it); the page then
// reloads so everything — including text the server sent — comes back translated.
import { LOCALE_COOKIE, LOCALE_META, LOCALES, type Locale } from "@/lib/i18n";
import { useLocale, useT } from "./I18nProvider";
import { Button } from "./Button";

export async function setLanguage(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${365 * 86_400}; samesite=lax`;
  // Best effort: visitors on the website have no account yet, and that's fine.
  await fetch("/api/me", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale }) }).catch(() => {});
  // The service worker keeps the offline page (and the game's shell) in the old language otherwise.
  navigator.serviceWorker?.controller?.postMessage({ type: "LOCALE" });
  const url = new URL(location.href);
  url.searchParams.delete("lang"); // ?lang= would override the new choice
  location.replace(url);
  return new Promise<never>(() => {}); // keep the button busy until the page goes
}

/** A row of language buttons (game settings). */
export function LanguagePicker() {
  const locale = useLocale();
  return (
    <div className="lang-pick" role="radiogroup">
      {LOCALES.map((l) => (
        <Button key={l} role="radio" aria-checked={l === locale} lang={l} className={`btn small ${l === locale ? "yellow" : "ghost"}`} onClick={() => l !== locale && setLanguage(l)}>
          {LOCALE_META[l].name}
        </Button>
      ))}
    </div>
  );
}

/** One button that switches to the other language, labelled in that language (site header). */
export function LanguageToggle({ className = "btn ghost small" }: { className?: string }) {
  const locale = useLocale();
  const t = useT();
  const other = LOCALES.find((l) => l !== locale)!;
  return (
    <Button className={className} lang={other} title={t("Language")} aria-label={`${t("Language")}: ${LOCALE_META[other].name}`} onClick={() => setLanguage(other)}>
      🌐 {LOCALE_META[other].name}
    </Button>
  );
}
