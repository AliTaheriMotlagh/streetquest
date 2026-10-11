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
  const inApp = IN_APP.find(([re]) => re.test(ua))?.[1] ?? (wv ? "this app" : null);
  const desktop = os === "mac" || os === "windows" || (os === "linux" && !/Mobile/.test(ua));
  return { os, name, inApp, desktop };
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
  return [...siteLocationStep(b), ...desktopLocationSteps(b)];
}

/** Allow location for this site in a desktop browser. */
function siteLocationStep(b: BrowserInfo): string[] {
  if (b.name === "chrome" || b.name === "edge" || b.name === "opera")
    return ["Click the icon left of the address (🔒 or ⚙) → Site settings → Location → Allow, then reload."];
  if (b.name === "firefox") return ["Click the 🔒 left of the address → clear the blocked Location permission, then Retry and choose Allow."];
  if (b.name === "safari") return ["Safari → Settings → Websites → Location → set this site to Allow."];
  return ["Click the 🔒 next to the address → Location → Allow, then Retry."];
}

/** A computer also needs location switched on for the browser at the system level. */
function desktopLocationSteps(b: BrowserInfo): string[] {
  const app = browserLabel(b);
  if (b.os === "mac") return [`System Settings → Privacy & Security → Location Services → turn it on, and turn on ${app} in the list.`, "Keep Wi-Fi on (it doesn't need to be connected): Macs find their location from nearby networks."];
  if (b.os === "windows")
    return ["Windows Settings → Privacy & security → Location → turn on Location services and “Let desktop apps access your location”.", "Keep Wi-Fi on: PCs find their location from nearby networks."];
  if (b.os === "linux") return ["Make sure your system's location service is on and Wi-Fi is switched on."];
  return [];
}

/**
 * The computer has no location to give. Desktop browsers locate from Wi-Fi networks
 * through an online service, which some networks and countries can't reach.
 */
export function desktopUnavailableSteps(b: BrowserInfo): string[] {
  return [
    ...desktopLocationSteps(b),
    ...(b.name === "chrome" || b.name === "edge" ? [`${browserLabel(b)} looks up Wi-Fi locations online; on some networks that service is blocked. A VPN, or Safari on a Mac, usually works.`] : []),
  ];
}

/** "Approximate location" is on: how to switch this browser back to precise GPS. */
export function preciseSteps(b: BrowserInfo): string[] {
  const app = browserLabel(b);
  if (b.os === "ios") {
    if (b.name === "safari" || b.name === "other") return ["Open the iPhone Settings app → Privacy & Security → Location Services → Safari Websites.", "Turn on Precise Location, then come back and tap Retry."];
    return [`Open the iPhone Settings app → ${app} → Location.`, "Turn on Precise Location, then come back and tap Retry."];
  }
  if (b.os === "android")
    return [`Settings → Apps → ${app} → Permissions → Location → turn on “Use precise location”.`, "Also check Settings → Location → Location services → Google Location Accuracy is on.", "Then come back and tap Retry."];
  if (b.desktop) return [...desktopLocationSteps(b), "Computers locate from Wi-Fi, so it's rarely street-accurate — walk with your phone, or play from home here."];
  return ["Turn on precise / high-accuracy location for this browser in your device settings, then tap Retry."];
}

/** Step-by-step "allow the camera and mic again" (video calls), for this exact browser. */
export function cameraSteps(b: BrowserInfo, installed = false): string[] {
  const app = browserLabel(b);
  if (b.os === "ios") {
    if (b.name === "safari" || b.name === "other")
      return [
        installed ? "Open the game in Safari once, then tap ᴀA in the address bar → Website Settings → Camera and Microphone → Allow." : "Tap ᴀA (or the page icon) in the address bar → Website Settings → Camera and Microphone → Allow.",
        "Still blocked? iPhone Settings → Safari → Camera and Microphone → Ask or Allow.",
      ];
    return [`Open the iPhone Settings app → ${app} → turn on Camera and Microphone.`, `Then come back to ${app} and tap Try again.`];
  }
  if (b.os === "android") {
    // An installed app has no address bar: its site settings hang off the app icon.
    const site = installed
      ? "Long-press the StreetQuest icon → App info (ⓘ) → Permissions → allow Camera and Microphone."
      : b.name === "samsung"
        ? "Tap ☰ → Settings → Sites and downloads → Site permissions → Camera / Microphone → allow this site."
        : b.name === "firefox"
          ? "Tap the 🔒 next to the address → Permissions → Camera and Microphone → Allowed."
          : "Tap the 🔒 (or ⓘ) next to the address → Permissions → turn on Camera and Microphone.";
    return [
      site,
      `Make sure ${app} itself is allowed: phone Settings → Apps → ${app} → Permissions → Camera and Microphone → Allow while using.`,
      "Swipe down from the top: if Camera access or Microphone access is switched off there, turn it on.",
    ];
  }
  if (b.os === "mac") return ["Click the 🔒 next to the address → Camera and Microphone → Allow.", `System Settings → Privacy & Security → Camera (and Microphone) → turn on ${app}.`];
  return ["Click the 🔒 next to the address → Camera and Microphone → Allow, then Try again."];
}

/** Android can hand the page straight to Chrome; iOS can only be told how. */
export function openInBrowserUrl(b: BrowserInfo): string | null {
  if (typeof location === "undefined" || b.os !== "android") return null;
  return `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=https;package=com.android.chrome;end`;
}
