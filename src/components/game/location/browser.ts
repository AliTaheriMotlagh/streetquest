// Which browser are we in? Location permission lives in a different place for each,
// and in-app browsers (Instagram, Facebook, TikTok…) often block GPS entirely.
export type Os = "ios" | "android" | "mac" | "other";
export type BrowserName = "safari" | "chrome" | "firefox" | "edge" | "samsung" | "opera" | "other";
export type BrowserInfo = { os: Os; name: BrowserName; inApp: string | null };

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
  const os: Os = /iPhone|iPad|iPod/.test(ua) || ipad ? "ios" : /Android/.test(ua) ? "android" : /Macintosh/.test(ua) ? "mac" : "other";
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
  const inApp = IN_APP.find(([re]) => re.test(ua))?.[1] ?? (wv ? "this app" : null);
  return { os, name, inApp };
}

const LABEL: Record<BrowserName, string> = { safari: "Safari", chrome: "Chrome", firefox: "Firefox", edge: "Edge", samsung: "Samsung Internet", opera: "Opera", other: "your browser" };
export const browserLabel = (b: BrowserInfo) => LABEL[b.name];

/** Step-by-step "turn location back on" for this exact browser. */
export function locationSteps(b: BrowserInfo): string[] {
  const app = browserLabel(b);
  if (b.os === "ios") {
    // On iPhone every browser except Safari needs the iOS-level permission for the app itself.
    if (b.name === "safari" || b.name === "other")
      return ["Tap ᴀA (or the page icon) in the address bar → Website Settings → Location → Allow.", "Still blocked? Settings → Privacy & Security → Location Services → Safari Websites → While Using the App."];
    return [`Open the iPhone Settings app → ${app} → Location → While Using the App.`, "Also check Settings → Privacy & Security → Location Services is on.", `Then come back to ${app} and tap Retry.`];
  }
  if (b.os === "android") {
    const site =
      b.name === "samsung"
        ? "Tap ☰ → Settings → Sites and downloads → Site permissions → Location → allow this site."
        : b.name === "firefox"
          ? "Tap the 🔒 next to the address → Permissions → Location → Allowed."
          : "Tap the 🔒 (or ⓘ) next to the address → Permissions → Location → Allow.";
    return [site, `Make sure phone Location is on (swipe down → Location) and ${app} is allowed: Settings → Apps → ${app} → Permissions → Location → Allow while using.`];
  }
  if (b.os === "mac") return [`Click the 🔒 next to the address → Location → Allow.`, `System Settings → Privacy & Security → Location Services → turn on ${app}.`];
  return [`Click the 🔒 next to the address → Location → Allow, then Retry.`];
}

/** Android can hand the page straight to Chrome; iOS can only be told how. */
export function openInBrowserUrl(b: BrowserInfo): string | null {
  if (typeof location === "undefined" || b.os !== "android") return null;
  return `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
}
