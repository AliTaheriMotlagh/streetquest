"use client";
// App shell glue: registers the service worker, offers updates when a new version
// is deployed, and tells the player when they're offline.
import { useEffect, useState } from "react";
import { swEnabled } from "./pwaClient";

export function Pwa() {
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [offline, setOffline] = useState(false);

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
    if (!swEnabled()) {
      // Dev server: make sure no old production worker is caching dev files.
      navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {});
      return;
    }
    let reg: ServiceWorkerRegistration | undefined;
    let reloading = false;
    const track = (r: ServiceWorkerRegistration) => {
      // A new version finished installing while an old one controls the page → offer it.
      if (r.waiting && navigator.serviceWorker.controller) setWaiting(r.waiting);
      r.addEventListener("updatefound", () => {
        const w = r.installing;
        w?.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) setWaiting(w);
        });
      });
    };
    navigator.serviceWorker
      .register("/sw.js", { scope: "/", updateViaCache: "none" })
      .then((r) => {
        reg = r;
        track(r);
      })
      .catch((e) => console.warn("service worker failed", e));
    const onCtrl = () => {
      if (reloading) return;
      reloading = true;
      location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onCtrl);
    // Look for new versions when the app comes back to the foreground, and every 30 min.
    const check = () => document.visibilityState === "visible" && reg?.update().catch(() => {});
    document.addEventListener("visibilitychange", check);
    const t = setInterval(check, 30 * 60_000);
    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onCtrl);
      document.removeEventListener("visibilitychange", check);
      clearInterval(t);
    };
  }, []);

  return (
    <>
      {offline && (
        <div className="offline-bar" role="status">
          📴 <b>Offline</b> · showing your last map
        </div>
      )}
      {waiting && (
        <div className="update-bar" role="alert">
          <span className="grow">✨ <b>New version ready</b> — new features and fixes</span>
          <button className="btn ghost small" onClick={() => setWaiting(null)}>Later</button>
          <button className="btn green small" onClick={() => waiting.postMessage({ type: "SKIP_WAITING" })}>Update</button>
        </div>
      )}
    </>
  );
}
