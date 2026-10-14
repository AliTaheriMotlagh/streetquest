import { msg, t } from "@/lib/i18n";

// Which browser are we in? Location permission lives in a different place for each,
// and in-app browsers (Instagram, Facebook, TikTok…) often block GPS entirely.
export type Os = "ios" | "android" | "mac" | "windows" | "linux" | "other";
export type BrowserName = "safari" | "chrome" | "firefox" | "edge" | "samsung" | "opera" | "other";
/** `desktop`: a computer — no GPS chip; it locates itself from Wi-Fi networks at best. */
export type BrowserInfo = { os: Os; name: BrowserName; inApp: string | null; desktop: boolean };

const IN_APP: [RegExp, string][] = [
  [/Instagram/i, "Instagram"],
  [/FBAN|FBAV|FB_IAB|FBIOS/i, "Facebook"],
  [/musical_ly|BytedanceWebview|TikTok/i, "TikTok"],
  [/Snapchat/i, "Snapchat"],
  [/LinkedInApp/i, "LinkedIn"],
  [/Line\//i, "LINE"],
  [/Twitter/i, "X"],
  [/MicroMessenger/i, "WeChat"],
  [/Pinterest/i, "Pinterest"],
];

export function browserInfo(ua = typeof navigator !== "undefined" ? navigator.userAgent : ""): BrowserInfo {
  // iPadOS reports itself as a Mac; touch support gives it away.
  const ipad = /Macintosh/.test(ua) && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1;
  const os: Os = /iPhone|iPad|iPod/.test(ua) || ipad
    ? "ios"
    : /Android/.test(ua)
      ? "android"
      : /Macintosh/.test(ua)
        ? "mac"
        : /Windows/.test(ua)
          ? "windows"
          : /Linux|CrOS|X11/.test(ua)
            ? "linux"
            : "other";
  const name: BrowserName = /CriOS|Chrome/.test(ua) && !/EdgiOS|EdgA|Edg\/|SamsungBrowser|OPR|OPiOS/.test(ua)
    ? "chrome"
    : /FxiOS|Firefox/.test(ua)
      ? "firefox"
      : /EdgiOS|EdgA|Edg\//.test(ua)
        ? "edge"
        : /SamsungBrowser/.test(ua)
          ? "samsung"
          : /OPR|OPiOS/.test(ua)
            ? "opera"
            : /Safari/.test(ua)
              ? "safari"
              : "other";
  // Android WebViews mark themselves with "; wv)"; iOS ones lack "Safari/".
  const wv = os === "android" ? /; wv\)/.test(ua) : os === "ios" && !/Safari\//.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  const inApp = IN_APP.find(([re]) => re.test(ua))?.[1] ?? (wv ? t("this app") : null);
  const desktop = os === "mac" || os === "windows" || (os === "linux" && !/Mobile/.test(ua));
  return { os, name, inApp, desktop };
}

const LABEL: Record<BrowserName, string> = { safari: "Safari", chrome: "Chrome", firefox: "Firefox", edge: "Edge", samsung: "Samsung Internet", opera: "Opera", other: msg("your browser") };
export const browserLabel = (b: BrowserInfo) => t(LABEL[b.name]);

/** Step-by-step "turn location back on" for this exact browser. */
export function locationSteps(b: BrowserInfo): string[] {
  const app = browserLabel(b);
  if (b.os === "ios") {
    // On iPhone every browser except Safari needs the iOS-level permission for the app itself.
    if (b.name === "safari" || b.name === "other")
      return [t("Tap ᴀA (or the page icon) in the address bar → Website Settings → Location → Allow."), t("Still blocked? Settings → Privacy & Security → Location Services → Safari Websites → While Using the App.")];
    return [t("Open the iPhone Settings app → {app} → Location → While Using the App.", { app }), t("Also check Settings → Privacy & Security → Location Services is on."), t("Then come back to {app} and tap Retry.", { app })];
  }
  if (b.os === "android") {
    const site =
      b.name === "samsung"
        ? t("Tap ☰ → Settings → Sites and downloads → Site permissions → Location → allow this site.")
        : b.name === "firefox"
          ? t("Tap the 🔒 next to the address → Permissions → Location → Allowed.")
          : t("Tap the 🔒 (or ⓘ) next to the address → Permissions → Location → Allow.");
    return [site, t("Make sure phone Location is on (swipe down → Location) and {app} is allowed: Settings → Apps → {app} → Permissions → Location → Allow while using.", { app })];
  }
  return [...siteLocationStep(b), ...desktopLocationSteps(b)];
}

/** Allow location for this site in a desktop browser. */
function siteLocationStep(b: BrowserInfo): string[] {
  if (b.name === "chrome" || b.name === "edge" || b.name === "opera")
    return [t("Click the icon left of the address (🔒 or ⚙) → Site settings → Location → Allow, then reload.")];
  if (b.name === "firefox") return [t("Click the 🔒 left of the address → clear the blocked Location permission, then Retry and choose Allow.")];
  if (b.name === "safari") return [t("Safari → Settings → Websites → Location → set this site to Allow.")];
  return [t("Click the 🔒 next to the address → Location → Allow, then Retry.")];
}

/** A computer also needs location switched on for the browser at the system level. */
function desktopLocationSteps(b: BrowserInfo): string[] {
  const app = browserLabel(b);
  if (b.os === "mac") return [t("System Settings → Privacy & Security → Location Services → turn it on, and turn on {app} in the list.", { app }), t("Keep Wi-Fi on (it doesn't need to be connected): Macs find their location from nearby networks.")];
  if (b.os === "windows")
    return [t("Windows Settings → Privacy & security → Location → turn on Location services and “Let desktop apps access your location”."), t("Keep Wi-Fi on: PCs find their location from nearby networks.")];
  if (b.os === "linux") return [t("Make sure your system's location service is on and Wi-Fi is switched on.")];
  return [];
}

/**
 * The computer has no location to give. Desktop browsers locate from Wi-Fi networks
 * through an online service, which some networks and countries can't reach.
 */
export function desktopUnavailableSteps(b: BrowserInfo): string[] {
  return [
    ...desktopLocationSteps(b),
    ...(b.name === "chrome" || b.name === "edge" ? [t("{app} looks up Wi-Fi locations online; on some networks that service is blocked. A VPN, or Safari on a Mac, usually works.", { app: browserLabel(b) })] : []),
  ];
}

/** "Approximate location" is on: how to switch this browser back to precise GPS. */
export function preciseSteps(b: BrowserInfo): string[] {
  const app = browserLabel(b);
  if (b.os === "ios") {
    if (b.name === "safari" || b.name === "other") return [t("Open the iPhone Settings app → Privacy & Security → Location Services → Safari Websites."), t("Turn on Precise Location, then come back and tap Retry.")];
    return [t("Open the iPhone Settings app → {app} → Location.", { app }), t("Turn on Precise Location, then come back and tap Retry.")];
  }
  if (b.os === "android")
    return [t("Settings → Apps → {app} → Permissions → Location → turn on “Use precise location”.", { app }), t("Also check Settings → Location → Location services → Google Location Accuracy is on."), t("Then come back and tap Retry.")];
  if (b.desktop) return [...desktopLocationSteps(b), t("Computers locate from Wi-Fi, so it's rarely street-accurate — walk with your phone, or play from home here.")];
  return [t("Turn on precise / high-accuracy location for this browser in your device settings, then tap Retry.")];
}

/** Step-by-step t("allow the camera and mic again") (video calls), for this exact browser. */
export function cameraSteps(b: BrowserInfo, installed = false): string[] {
  const app = browserLabel(b);
  if (b.os === "ios") {
    if (b.name === "safari" || b.name === "other")
      return [
        installed ? t("Open the game in Safari once, then tap ᴀA in the address bar → Website Settings → Camera and Microphone → Allow.") : t("Tap ᴀA (or the page icon) in the address bar → Website Settings → Camera and Microphone → Allow."),
        t("Still blocked? iPhone Settings → Safari → Camera and Microphone → Ask or Allow."),
      ];
    return [t("Open the iPhone Settings app → {app} → turn on Camera and Microphone.", { app }), t("Then come back to {app} and tap Try again.", { app })];
  }
  if (b.os === "android") {
    // An installed app has no address bar: its site settings hang off the app icon.
    const site = installed
      ? t("Long-press the StreetQuest icon → App info (ⓘ) → Permissions → allow Camera and Microphone.")
      : b.name === "samsung"
        ? t("Tap ☰ → Settings → Sites and downloads → Site permissions → Camera / Microphone → allow this site.")
        : b.name === "firefox"
          ? t("Tap the 🔒 next to the address → Permissions → Camera and Microphone → Allowed.")
          : t("Tap the 🔒 (or ⓘ) next to the address → Permissions → turn on Camera and Microphone.");
    return [
      site,
      t("Make sure {app} itself is allowed: phone Settings → Apps → {app} → Permissions → Camera and Microphone → Allow while using.", { app }),
      t("Swipe down from the top: if Camera access or Microphone access is switched off there, turn it on."),
    ];
  }
  if (b.os === "mac") return [t("Click the 🔒 next to the address → Camera and Microphone → Allow."), t("System Settings → Privacy & Security → Camera (and Microphone) → turn on {app}.", { app })];
  return [t("Click the 🔒 next to the address → Camera and Microphone → Allow, then Try again.")];
}

/** Android can hand the page straight to Chrome; iOS can only be told how. */
export function openInBrowserUrl(b: BrowserInfo): string | null {
  if (typeof location === "undefined" || b.os !== "android") return null;
  return `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
}
