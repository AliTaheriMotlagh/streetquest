"use client";
// One ad in a list (lib/ads/slot.ts): nothing is fetched until it scrolls near the screen; then a player's
// house ad if one is running, else the networks set up for the player's country in order — Yektanet,
// Tapsell (Iran), AdSense (outside Iran) — each loaded only then. Anything that fails leaves no gap: the slot
// simply isn't there. Never used in the 3D city (lists in sheets and pages only).
import { useEffect, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import type { AdNetworks, AdProvider } from "@/lib/ads/slot";

type Slot = { chain: AdProvider[]; nets: AdNetworks; house: { id: string; title: string; body: string; emoji: string; link: boolean } | null };

const scripts = new Map<string, Promise<boolean>>();
function loadScript(src: string, attrs: Record<string, string> = {}) {
  let p = scripts.get(src);
  if (!p) {
    p = new Promise<boolean>((resolve) => {
      const s = document.createElement("script");
      s.async = true;
      s.src = src;
      for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
      s.onload = () => resolve(true);
      s.onerror = () => (scripts.delete(src), s.remove(), resolve(false));
      document.head.appendChild(s);
    });
    scripts.set(src, p);
  }
  return p;
}

/** Fills `box` with a network's ad; false when the network can't (blocked, not set up). */
async function fill(box: HTMLElement, p: AdProvider, nets: AdNetworks): Promise<boolean> {
  if (p === "adsense" && nets.adsense) {
    const ok = await loadScript(`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(nets.adsense.client)}`, { crossorigin: "anonymous" });
    if (!ok) return false;
    const ins = document.createElement("ins");
    ins.className = "adsbygoogle";
    ins.style.display = "block";
    ins.dataset.adClient = nets.adsense.client;
    ins.dataset.adSlot = nets.adsense.slot;
    ins.dataset.adFormat = "fluid";
    ins.dataset.fullWidthResponsive = "true";
    box.appendChild(ins);
    ((window as unknown as { adsbygoogle?: unknown[] }).adsbygoogle ||= []).push({});
    return true;
  }
  // Yektanet / Tapsell: the publisher's own script from their panel (YEKTANET_SCRIPT / TAPSELL_SCRIPT); it fills
  // the element with the id their panel names — the slot gives it a host with that id.
  const src = p === "yektanet" ? nets.yektanet : p === "tapsell" ? nets.tapsell : undefined;
  if (!src) return false;
  const host = document.createElement("div");
  host.id = new URL(src, location.href).hash.slice(1) || `${p}-slot`;
  box.appendChild(host);
  return loadScript(src.split("#")[0]);
}

export function AdSlot({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const netRef = useRef<HTMLDivElement>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (es) => {
        if (!es.some((e) => e.isIntersecting)) return;
        io.disconnect();
        fetch("/api/ads/slot", { cache: "no-store" })
          .then((r) => (r.ok ? (r.json() as Promise<Slot>) : null))
          .then((s) => (s && (s.house || s.chain.length) ? setSlot(s) : setGone(true)))
          .catch(() => setGone(true));
      },
      { rootMargin: "300px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // No house ad: walk the networks until one fills.
  useEffect(() => {
    if (!slot || slot.house || !netRef.current) return;
    let dead = false;
    void (async () => {
      for (const p of slot.chain) {
        if (dead || !netRef.current) return;
        netRef.current.replaceChildren();
        if (await fill(netRef.current, p, slot.nets).catch(() => false)) return;
      }
      if (!dead) setGone(true);
    })();
    return () => void (dead = true);
  }, [slot]);

  if (gone) return null;
  const h = slot?.house;
  return (
    <div ref={ref} className={`ad-slot ${className}`} aria-label={t("Ad")}>
      {h ? (
        <a className="ad-house" href={h.link ? `/api/ads/go?id=${encodeURIComponent(h.id)}` : undefined} target="_blank" rel="noopener sponsored">
          <span className="ad-emoji" aria-hidden>{h.emoji}</span>
          <span className="ad-text">
            <b dir="auto">{h.title}</b>
            {h.body && <span className="small muted" dir="auto">{h.body}</span>}
          </span>
          <span className="ad-tag tiny">{t("Ad")}</span>
        </a>
      ) : (
        <div ref={netRef} className="ad-net" />
      )}
    </div>
  );
}
