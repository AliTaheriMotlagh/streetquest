import type { Metadata, Viewport } from "next";
import { Inter, Lilita_One, Russo_One } from "next/font/google";
import { preload } from "react-dom";
import { Analytics } from "@/components/Analytics";
import { DialogHost } from "@/components/Dialogs";
import { I18nProvider } from "@/components/I18nProvider";
import { Pwa } from "@/components/Pwa";
import { dirOf, LOCALE_META } from "@/lib/i18n";
import { SITE, siteText } from "@/lib/site";
import { getT, pageLocale } from "@/server/i18n";
import "leaflet/dist/leaflet.css";
import "./globals.css";

// Self-hosted at build time: no render-blocking request to Google, no layout shift.
const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "800"], display: "swap", variable: "--font-inter" });
const lilita = Lilita_One({ subsets: ["latin"], weight: "400", display: "swap", variable: "--font-lilita" });
const russo = Russo_One({ subsets: ["latin"], weight: "400", display: "swap", variable: "--font-russo" });

/** Persian UI font (public/fonts, @font-face in globals.css). Only Persian pages fetch it. */
const VAZIRMATN = ["/fonts/Vazirmatn-UI-FD-Regular.woff2", "/fonts/Vazirmatn-UI-FD-Black.woff2"];

export async function generateMetadata(): Promise<Metadata> {
  const { t, locale } = await getT();
  const s = siteText(t);
  return {
    metadataBase: new URL(SITE.url),
    title: { default: `${SITE.name} — ${s.tagline}`, template: `%s · ${SITE.name}` },
    description: s.description,
    keywords: s.keywords,
    applicationName: SITE.name,
    openGraph: { type: "website", siteName: SITE.name, title: `${SITE.name} — ${s.tagline}`, description: s.description, url: SITE.url, locale: LOCALE_META[locale].og },
    twitter: { card: "summary_large_image", title: SITE.name, description: s.description },
    appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: SITE.name },
    icons: { icon: [{ url: "/icons/favicon-64.png", sizes: "64x64", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
    manifest: "/manifest.webmanifest",
    robots: { index: true, follow: true },
    formatDetection: { telephone: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#07070d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await pageLocale();
  if (locale === "fa") for (const href of VAZIRMATN) preload(href, { as: "font", type: "font/woff2", crossOrigin: "anonymous" });
  return (
    <html lang={locale} dir={dirOf(locale)} className={`${inter.variable} ${lilita.variable} ${russo.variable}`}>
      <body>
        <I18nProvider locale={locale}>
          {children}
          <DialogHost />
          <Pwa />
        </I18nProvider>
        <Analytics />
      </body>
    </html>
  );
}
