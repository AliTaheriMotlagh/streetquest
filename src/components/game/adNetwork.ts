// Google H5 Games Ads (Ad Placement API, part of AdSense) for rewarded videos.
// The SDK is loaded the first time a player opens a rewarded ad, never on page
// load, so players who don't watch ads don't pay for it. Everything resolves to
// "no ad" instead of throwing: blocked script, no fill in the player's country,
// frequency cap, or a slow network all fall back to the game's sponsor spot.
// Docs: https://developers.google.com/ad-placement

export type AdNetwork = { provider: string; client: string; test: boolean };

type Placement = { breakStatus?: string };
type AdBreak = {
  type: "reward";
  name: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  beforeReward: (showAdFn: () => void) => void;
  adDismissed: () => void;
  adViewed: () => void;
  adBreakDone: (p: Placement) => void;
};
type W = Window & { adsbygoogle?: unknown[]; adBreak?: (o: AdBreak) => void; adConfig?: (o: object) => void };

let loading: Promise<boolean> | null = null;

function load(net: AdNetwork): Promise<boolean> {
  if (loading) return loading;
  loading = new Promise<boolean>((resolve) => {
    const w = window as W;
    w.adsbygoogle = w.adsbygoogle || [];
    w.adBreak = w.adConfig = (o: object) => (w.adsbygoogle as unknown[]).push(o);
    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(net.client)}`;
    s.dataset.adClient = net.client;
    if (net.test) s.dataset.adbreakTest = "on";
    s.onload = () => {
      w.adConfig!({ preloadAdBreaks: "on", sound: "on" });
      resolve(true);
    };
    // Ad blocker or offline: try again next time instead of caching the failure.
    s.onerror = () => {
      loading = null;
      s.remove();
      resolve(false);
    };
    document.head.appendChild(s);
  });
  return loading;
}

export type RewardedAd = {
  /** Plays the video. Must be called from a tap. Resolves true when it was watched to the end. */
  show: (hooks: { onStart: () => void; onEnd: () => void }) => Promise<boolean>;
};

/** Asks Google for a rewarded video; null when there's none to show right now. */
export async function requestRewarded(net: AdNetwork, timeoutMs = 6000): Promise<RewardedAd | null> {
  if (typeof window === "undefined" || !(await load(net))) return null;
  return new Promise((resolve) => {
    let offered = false;
    let finish: ((watched: boolean) => void) | null = null;
    let hooks: { onStart: () => void; onEnd: () => void } | null = null;
    const timer = setTimeout(() => !offered && ((offered = true), resolve(null)), timeoutMs);
    try {
      (window as W).adBreak!({
        type: "reward",
        name: "free-gems",
        beforeAd: () => hooks?.onStart(),
        afterAd: () => hooks?.onEnd(),
        beforeReward: (showAdFn) => {
          if (offered) return; // timed out: the player already got the sponsor spot
          offered = true;
          clearTimeout(timer);
          resolve({
            show: (h) =>
              new Promise<boolean>((done) => {
                hooks = h;
                finish = done;
                showAdFn();
              }),
          });
        },
        adViewed: () => finish?.(true),
        adDismissed: () => finish?.(false),
        // Without beforeReward first, Google had nothing to show (notReady, frequencyCapped, …).
        adBreakDone: () => {
          if (!offered) {
            offered = true;
            clearTimeout(timer);
            resolve(null);
          } else finish?.(false);
        },
      });
    } catch {
      clearTimeout(timer);
      resolve(null);
    }
  });
}
