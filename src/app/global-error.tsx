"use client";
// Last-resort error screen (the root layout itself failed), so it brings its own <html>.
// No language provider is mounted up here, so it reads the player's language cookie and
// loads that catalog; until that's loaded it shows English.
import { useEffect, useState } from "react";
import { isLocale, LOCALE_COOKIE, LOCALE_META, translate, type Locale } from "@/lib/i18n";
import { loadCatalog } from "@/lib/i18n/load";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [locale, setLocale] = useState<Locale>("en");
  useEffect(() => {
    const cookie = document.cookie.split(/;\s*/).find((c) => c.startsWith(`${LOCALE_COOKIE}=`))?.slice(LOCALE_COOKIE.length + 1);
    if (!isLocale(cookie)) return;
    loadCatalog(cookie).then(() => setLocale(cookie));
  }, []);
  const t = (message: string) => translate(locale, message);
  return (
    <html lang={locale} dir={LOCALE_META[locale].dir}>
      <body style={{ background: "#0b0e14", color: "#f4f4fb", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 16 }}>
          <div style={{ fontSize: 44 }}>🛠️</div>
          <h2>{t("Something went wrong")}</h2>
          <button onClick={reset} style={{ padding: "10px 18px", borderRadius: 12, border: 0, background: "#ee7fae", color: "#fff", fontWeight: 800, cursor: "pointer" }}>
            {t("Try again")}
          </button>
        </div>
      </body>
    </html>
  );
}
