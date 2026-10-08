import type { Metadata, Viewport } from "next";
import { Inter, Lilita_One, Russo_One } from "next/font/google";
import { Analytics } from "@/components/Analytics";
import { DialogHost } from "@/components/Dialogs";
import { Pwa } from "@/components/Pwa";
import { SITE } from "@/lib/site";
import "leaflet/dist/leaflet.css";
import "./globals.css";

// Self-hosted at build time: no render-blocking request to Google, no layout shift.
const inter = Inter({ subsets: ["latin"], weight: ["400", "600", "800"], display: "swap", variable: "--font-inter" });
const lilita = Lilita_One({ subsets: ["latin"], weight: "400", display: "swap", variable: "--font-lilita" });
const russo = Russo_One({ subsets: ["latin"], weight: "400", display: "swap", variable: "--font-russo" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  keywords: SITE.keywords,
  applicationName: SITE.name,
  openGraph: { type: "website", siteName: SITE.name, title: `${SITE.name} — ${SITE.tagline}`, description: SITE.description, url: SITE.url },
  twitter: { card: "summary_large_image", title: SITE.name, description: SITE.description },
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: SITE.name },
  icons: { icon: [{ url: "/icons/favicon-64.png", sizes: "64x64", type: "image/png" }, { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }], apple: "/icons/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
  robots: { index: true, follow: true },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#07070d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${lilita.variable} ${russo.variable}`}>
      <body>
        {children}
        <DialogHost />
        <Pwa />
        <Analytics />
      </body>
    </html>
  );
}
