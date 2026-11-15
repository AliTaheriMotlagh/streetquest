"use client";
// Catches errors in the player's browser and sends them to POST /api/log (the rules: lib/clientLog.ts):
// uncaught errors and promise rejections, scripts or styles that didn't load (a deploy changed the
// files under an open tab, a blocked CDN), and — through logClient() — failed connections other code
// reports (the realtime server, map tiles, a site the phone asks directly). Each kind+message once per
// page, at most MAX_PER_PAGE in all; sent with sendBeacon so it survives the page closing.
import { useEffect } from "react";
import { MAX_PER_PAGE, type ClientKind } from "@/lib/clientLog";

const sent = new Set<string>();
// Leaving the page cancels its requests ("Failed to fetch"): not an error worth keeping.
let leaving = false;
if (typeof window !== "undefined") {
  addEventListener("pagehide", () => (leaving = true));
  addEventListener("beforeunload", () => (leaving = true));
  addEventListener("pageshow", () => (leaving = false));
}

/** Report something that went wrong in this browser (kept, by kind and message, for Admin → Browser errors). */
export function logClient(kind: ClientKind, msg: string, host?: string) {
  if (typeof window === "undefined" || process.env.NODE_ENV === "test" || leaving) return;
  const key = `${kind}|${msg}|${host ?? ""}`;
  if (sent.has(key) || sent.size >= MAX_PER_PAGE) return;
  sent.add(key);
  const body = JSON.stringify({ kind, msg: String(msg).slice(0, 300), host: host?.slice(0, 80), page: location.pathname.slice(0, 40) });
  try {
    if (navigator.sendBeacon?.("/api/log", new Blob([body], { type: "application/json" }))) return;
  } catch {}
  void fetch("/api/log", { method: "POST", headers: { "content-type": "application/json" }, body, keepalive: true }).catch(() => {});
}

/** The host of a URL ("" when it isn't one). */
const hostOf = (u: string) => {
  try {
    return new URL(u, location.href).host;
  } catch {
    return "";
  }
};

export function ClientLog() {
  useEffect(() => {
    const onError = (e: Event) => {
      // A <script>, <link> or <img> that failed to load: only scripts and styles matter (images have their own fallbacks).
      const el = e.target as HTMLElement | null;
      if (el && el !== (window as unknown as HTMLElement) && (el.tagName === "SCRIPT" || el.tagName === "LINK")) {
        const src = (el as HTMLScriptElement).src || (el as HTMLLinkElement).href || "";
        return logClient("chunk", `${el.tagName.toLowerCase()} failed: ${src.split("/").pop()?.split("?")[0] ?? ""}`, hostOf(src));
      }
      const ee = e as ErrorEvent;
      if (ee.message) logClient(/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(ee.message) ? "chunk" : "error", `${ee.message}${ee.filename ? ` (${ee.filename.split("/").pop()?.split("?")[0]}:${ee.lineno})` : ""}`);
    };
    const onRejection = (e: PromiseRejectionEvent) => {
      const r = e.reason as { message?: string; name?: string } | string | undefined;
      const msg = typeof r === "string" ? r : r?.message ?? String(r);
      // Aborted requests (leaving a screen) aren't errors.
      if (!msg || /AbortError|aborted/i.test(`${typeof r === "object" ? r?.name : ""} ${msg}`)) return;
      logClient(/ChunkLoadError|Loading chunk|dynamically imported module/i.test(msg) ? "chunk" : "promise", msg);
    };
    addEventListener("error", onError, true);
    addEventListener("unhandledrejection", onRejection);
    return () => {
      removeEventListener("error", onError, true);
      removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
