"use client";
// App shell glue: registers the service worker, offers updates when a new version
// is deployed, and tells the player when they're offline.
import { useEffect, useRef, useState } from "react";
import { swEnabled } from "./pwaClient";
import { installHScroll } from "./hscroll";
import { Button } from "./Button";

/** If the new worker hasn't taken over by then (message lost, odd browser), reload anyway. */
const UPDATE_FALLBACK_MS = 10_000;
/**
 * sessionStorage: this tab pressed Update at this time. The new worker can only take
 * over once the old one has no requests in flight, and a map game always has some
 * (tiles, polling) — so the fallback reload can land while the old version is still in
 * charge. The flag lets the reloaded page finish the update quietly instead of showing
 * the bar again.
 */
const PENDING_KEY = "sq_update_pending";
const PENDING_MAX_MS = 5 * 60_000;

const pendingUpdate = () => {
  try {
    const at = Number(sessionStorage.getItem(PENDING_KEY));
    return at > 0 && Date.now() - at < PENDING_MAX_MS;
  } catch {
    return false;
  }
};
const setPendingUpdate = (on: boolean) => {
  try {
    if (on) sessionStorage.setItem(PENDING_KEY, String(Date.now()));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {}
};

export function Pwa() {
  // "waiting": a new version is installed and can take over.
  // "activated": another tab already switched to it, this one still runs the old code.
  const [update, setUpdate] = useState<"waiting" | "activated" | null>(null);
  const [updating, setUpdating] = useState(false);
  const [offline, setOffline] = useState(false);
  const reg = useRef<ServiceWorkerRegistration | null>(null);
  const requested = useRef(false); // this tab pressed Update
  const dismissed = useRef<ServiceWorker | null>(null); // "Later" for this exact version

  // Desktop: wheel + drag scrolling for every horizontal tab/chip row.
  useEffect(() => installHScroll(), []);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    if (!swEnabled()) {
      // Dev server: make sure no old production worker is caching dev files.
      sw.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
      return;
    }
    let stopped = false;
    // Update was pressed before the reload: anything still waiting is the version the
    // player already asked for, and the next controller change should reload.
    let finishing = pendingUpdate();
    let giveUp: ReturnType<typeof setTimeout> | undefined;
    const stopFinishing = () => {
      finishing = false;
      requested.current = false;
      setPendingUpdate(false);
      setUpdating(false);
      clearTimeout(giveUp);
    };
    if (finishing) {
      requested.current = true;
      // Still not switched over by now: hand the choice back to the player.
      giveUp = setTimeout(() => {
        stopFinishing();
        offer();
      }, UPDATE_FALLBACK_MS * 2);
    }
    // A new version finished installing while an old one controls the page → offer it.
    const offer = () => {
      const w = reg.current?.waiting;
      if (stopped) return;
      if (finishing) {
        if (w && sw.controller) {
          setUpdating(true);
          setUpdate("waiting");
          w.postMessage({ type: "SKIP_WAITING" }); // → controllerchange → reload
        } else {
          stopFinishing(); // nothing waiting: we're already on the new version
          setUpdate(null);
        }
        return;
      }
      if (w && sw.controller && w !== dismissed.current) setUpdate("waiting");
    };
    const watch = (w: ServiceWorker | null) => w?.addEventListener("statechange", () => w.state === "installed" && offer());

    sw.register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((r) => {
        reg.current = r;
        offer();
        watch(r.installing);
        r.addEventListener("updatefound", () => watch(r.installing));
      })
      .catch((e) => console.warn("service worker failed", e));

    // First visit: the brand-new worker claims the page, which also fires
    // controllerchange. That is not an update — reloading then would yank a new
    // player out of sign-up. Only a change from one worker to another counts.
    let controlled = !!sw.controller;
    let reloading = false;
    const onCtrl = () => {
      if (!controlled) {
        controlled = true;
        return;
      }
      if (reloading) return;
      // Reload if the player asked for it, or nobody's looking. A visible tab that
      // didn't ask (another tab pressed Update) gets a "Reload" bar instead of being
      // yanked mid-game.
      if (requested.current || document.visibilityState === "hidden") {
        reloading = true;
        location.reload();
      } else setUpdate("activated");
    };
    sw.addEventListener("controllerchange", onCtrl);

    // Look for new versions when the app comes back to the foreground, and every 30 min.
    const check = () => {
      if (document.visibilityState !== "visible" || !reg.current) return;
      reg.current.update().then(offer, () => {});
    };
    document.addEventListener("visibilitychange", check);
    const t = setInterval(check, 30 * 60_000);
    return () => {
      stopped = true;
      clearTimeout(giveUp);
      sw.removeEventListener("controllerchange", onCtrl);
      document.removeEventListener("visibilitychange", check);
      clearInterval(t);
    };
  }, []);

  /** Never settles: the button stays locked with a spinner until the page reloads. */
  const apply = () => {
    setUpdating(true);
    requested.current = true;
    setPendingUpdate(true);
    // Ask the *current* waiting worker (a newer one may have replaced the one we
    // first saw). No waiting worker means it's already active — just reload.
    const w = reg.current?.waiting;
    if (w) {
      w.postMessage({ type: "SKIP_WAITING" }); // → controllerchange → reload
      setTimeout(() => location.reload(), UPDATE_FALLBACK_MS);
    } else location.reload();
    return new Promise<never>(() => {});
  };

  const later = () => {
    dismissed.current = reg.current?.waiting ?? null;
    setUpdate(null);
  };

  return (
    <>
      {offline && (
        <div className="offline-bar" role="status">
          📴 <b>Offline</b> · showing your last map
        </div>
      )}
      {update && (
        <div className="update-bar" role="alert" aria-live="assertive">
          <span className="grow">
            {updating ? (
              <>
                ⏳ <b>Updating…</b> — one moment
              </>
            ) : (
              <>
                ✨ <b>{update === "waiting" ? "New version ready" : "Game updated"}</b> — {update === "waiting" ? "new features and fixes" : "reload to get the latest"}
              </>
            )}
          </span>
          {!updating && (
            <>
              <Button className="btn ghost small" onClick={later}>
                Later
              </Button>
              <Button className="btn green small" onClick={apply}>
                {update === "waiting" ? "Update" : "Reload"}
              </Button>
            </>
          )}
        </div>
      )}
    </>
  );
}
