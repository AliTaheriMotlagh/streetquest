"use client";
import { t } from "@/lib/i18n";
// PWA helpers shared by the app shell and the settings screen: install prompt,
// push notification subscribe/unsubscribe, and the registration handle.

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: InstallEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // we show our own button instead of the browser's mini-bar
    deferred = e as InstallEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

export const onPwaChange = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};
export const isStandalone = () =>
  typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
// iPadOS Safari calls itself a Mac: tell them apart by the touch screen.
export const isIos = () => typeof navigator !== "undefined" && (/iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1));
export const canInstall = () => !!deferred;
export async function promptInstall() {
  if (!deferred) return false;
  await deferred.prompt();
  const { outcome } = await deferred.userChoice;
  deferred = null;
  emit();
  return outcome === "accepted";
}

// ---------------------------------------------------------------- push
export const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
export const swEnabled = () => process.env.NODE_ENV === "production" || (typeof localStorage !== "undefined" && localStorage.getItem("sq_sw") === "1");

function b64ToBytes(b64: string) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

export async function currentPushSub() {
  if (!pushSupported() || !swEnabled()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/** Ask permission, subscribe this device and register it with the server. Throws with a friendly message. */
export async function enablePush() {
  if (!pushSupported()) throw new Error(isIos() ? t("On iPhone, add StreetQuest to your Home Screen first (Share → Add to Home Screen), then turn notifications on from the app.") : t("This browser can't show notifications."));
  if (!swEnabled()) throw new Error(t("Notifications work in the installed / production app."));
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error(t("Notifications are blocked — allow them in your browser's site settings."));
  const keyRes = await fetch("/api/push").then((r) => r.json());
  if (!keyRes.publicKey) throw new Error(t("Notifications aren't set up on the server yet."));
  const reg = await navigator.serviceWorker.ready;
  const sub = await subscribe(reg, keyRes.publicKey);
  const r = await register(sub);
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? t("Couldn't turn notifications on"));
  return true;
}

/** This device's subscription for `publicKey`: reuses the current one unless it was made for another server key. */
async function subscribe(reg: ServiceWorkerRegistration, publicKey: string) {
  const key = b64ToBytes(publicKey);
  const sub = await reg.pushManager.getSubscription();
  if (sub && sameKey(sub, key)) return sub;
  // Made for an old key (the server's VAPID keys changed): every push to it would be rejected.
  await sub?.unsubscribe().catch(() => {});
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
}
function sameKey(sub: PushSubscription, key: Uint8Array) {
  const had = sub.options?.applicationServerKey;
  if (!had) return true; // the browser doesn't say: assume it's fine
  const a = new Uint8Array(had);
  return a.length === key.length && a.every((b, i) => b === key[i]);
}
const register = (sub: PushSubscription) =>
  fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "subscribe", sub: sub.toJSON() }) });

/**
 * On every launch, when notifications are allowed: make sure the server still has this
 * device (it forgets devices the push service rejected, another player may have signed
 * in here since, the server key may have changed). Quiet — never asks, never throws.
 */
export async function syncPush() {
  try {
    if (!pushSupported() || !swEnabled() || Notification.permission !== "granted") return;
    const reg = await navigator.serviceWorker.ready;
    if (!(await reg.pushManager.getSubscription())) return; // turned off on this device
    const keyRes = await fetch("/api/push").then((r) => (r.ok ? r.json() : null));
    if (!keyRes?.publicKey) return;
    await register(await subscribe(reg, keyRes.publicKey));
  } catch {}
}

/** The game left the screen: from now on this player gets pushes. keepalive outlives the page. */
export function reportAway() {
  try {
    if (Notification.permission !== "granted") return;
    void fetch("/api/push", { method: "POST", keepalive: true, headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "away" }) }).catch(() => {});
  } catch {}
}

export async function disablePush() {
  const sub = await currentPushSub();
  if (!sub) return;
  await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "unsubscribe", endpoint: sub.endpoint }) }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
