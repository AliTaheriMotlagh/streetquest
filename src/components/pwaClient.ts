"use client";
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
export const isIos = () => typeof navigator !== "undefined" && /iPhone|iPad|iPod/.test(navigator.userAgent);
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
  if (!pushSupported()) throw new Error(isIos() ? "On iPhone, add StreetQuest to your Home Screen first (Share → Add to Home Screen), then turn notifications on from the app." : "This browser can't show notifications.");
  if (!swEnabled()) throw new Error("Notifications work in the installed / production app.");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications are blocked — allow them in your browser's site settings.");
  const keyRes = await fetch("/api/push").then((r) => r.json());
  if (!keyRes.publicKey) throw new Error("Notifications aren't set up on the server yet.");
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(keyRes.publicKey) }));
  const r = await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "subscribe", sub: sub.toJSON() }) });
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? "Couldn't turn notifications on");
  return true;
}

export async function disablePush() {
  const sub = await currentPushSub();
  if (!sub) return;
  await fetch("/api/push", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "unsubscribe", endpoint: sub.endpoint }) }).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
