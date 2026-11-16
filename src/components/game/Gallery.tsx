"use client";
// Photos of a hotel, a product, a store — however many the sources gave. Best practice for many
// photos on a phone: one big picture at a time that you swipe (scroll snap, so it's the browser's
// own smooth swipe), dots and "3 / 8" so you know there's more, arrows on a computer, and a tap
// opens them full screen with a strip of thumbnails, swipe or ←/→, Escape to close. Broken photos
// drop out by themselves; with none left, the fallback (an emoji, the kind's icon) shows.
// Styles: app/gallery.css.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { fmtNum, t } from "@/lib/i18n";

/** The same photo twice (http vs https, a size suffix) counts once. */
export function uniquePhotos(list: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of list) {
    if (!u || typeof u !== "string") continue;
    const k = u.replace(/^https?:/, "").replace(/[?#].*$/, "");
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(u);
  }
  return out;
}

export function Gallery({ photos: list, alt = "", fallback, className = "", ratio = "4 / 3", badge }: { photos: (string | null | undefined)[]; alt?: string; fallback?: React.ReactNode; className?: string; ratio?: string; badge?: React.ReactNode }) {
  const [bad, setBad] = useState<Set<string>>(() => new Set());
  const photos = uniquePhotos(list).filter((u) => !bad.has(u));
  const [at, setAt] = useState(0);
  const [full, setFull] = useState<number | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const drop = useCallback((u: string) => setBad((b) => new Set(b).add(u)), []);
  const onScroll = () => {
    const el = strip.current;
    if (!el) return;
    const i = Math.round(Math.abs(el.scrollLeft) / Math.max(1, el.clientWidth));
    if (i !== at) setAt(i);
  };
  const go = (i: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const el = strip.current;
    if (!el) return;
    const n = Math.max(0, Math.min(photos.length - 1, i));
    const rtl = getComputedStyle(el).direction === "rtl";
    el.scrollTo({ left: (rtl ? -1 : 1) * n * el.clientWidth, behavior: "smooth" });
  };
  if (!photos.length) return <div className={`gl gl-empty ${className}`} style={{ aspectRatio: ratio }}>{fallback}{badge}</div>;
  return (
    <div className={`gl ${className}`} style={{ aspectRatio: ratio }}>
      <div className="gl-strip" ref={strip} onScroll={onScroll} role="region" aria-roledescription={t("carousel")} aria-label={t("{n} photos", { n: fmtNum(photos.length) })}>
        {photos.map((u, i) => (
          <button key={u} type="button" className="gl-slide" onClick={() => setFull(i)} aria-label={t("Photo {i} of {n} — open full screen", { i: fmtNum(i + 1), n: fmtNum(photos.length) })}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={u} alt={alt} loading={i < 1 ? "eager" : "lazy"} decoding="async" referrerPolicy="no-referrer" onError={() => drop(u)} />
          </button>
        ))}
      </div>
      {badge}
      {photos.length > 1 && (
        <>
          <span className="gl-count" aria-hidden>{fmtNum(Math.min(at, photos.length - 1) + 1)} / {fmtNum(photos.length)}</span>
          <span className="gl-dots" aria-hidden>
            {photos.slice(0, 7).map((u, i) => <i key={u} className={i === Math.min(at, 6) ? "on" : ""} />)}
          </span>
          {at > 0 && <button type="button" className="gl-arrow prev" onClick={(e) => go(at - 1, e)} aria-label={t("Previous photo")}>‹</button>}
          {at < photos.length - 1 && <button type="button" className="gl-arrow next" onClick={(e) => go(at + 1, e)} aria-label={t("Next photo")}>›</button>}
        </>
      )}
      {full != null && <Lightbox photos={photos} start={full} alt={alt} onClose={(i) => (setFull(null), go(i))} onBad={drop} />}
    </div>
  );
}

/** Full screen: the photo as big as it goes, thumbnails under it, swipe / arrows / ←→, Escape or ✕ to close. */
function Lightbox({ photos, start, alt, onClose, onBad }: { photos: string[]; start: number; alt: string; onClose: (at: number) => void; onBad: (u: string) => void }) {
  const [i, setI] = useState(start);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const n = photos.length;
  const step = useCallback((d: number) => setI((v) => (v + d + n) % n), [n]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const rtl = document.documentElement.dir === "rtl";
      if (e.key === "Escape") onClose(i);
      else if (e.key === "ArrowRight") step(rtl ? -1 : 1);
      else if (e.key === "ArrowLeft") step(rtl ? 1 : -1);
    };
    addEventListener("keydown", k);
    const was = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      removeEventListener("keydown", k);
      document.body.style.overflow = was;
    };
  }, [i, onClose, step]);
  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="gl-full"
      role="dialog"
      aria-modal="true"
      aria-label={t("Photos")}
      onClick={(e) => e.target === e.currentTarget && onClose(i)}
      onTouchStart={(e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
      onTouchEnd={(e) => {
        const s = touch.current;
        touch.current = null;
        if (!s) return;
        const dx = e.changedTouches[0].clientX - s.x, dy = e.changedTouches[0].clientY - s.y;
        const rtl = document.documentElement.dir === "rtl";
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) step((dx < 0 ? 1 : -1) * (rtl ? -1 : 1));
        else if (dy > 90) onClose(i);
      }}
    >
      <header className="gl-full-bar">
        <span>{fmtNum(i + 1)} / {fmtNum(n)}</span>
        <button type="button" onClick={() => onClose(i)} aria-label={t("Close")}>✕</button>
      </header>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img key={photos[i]} className="gl-full-img" src={photos[i]} alt={alt} referrerPolicy="no-referrer" onError={() => (onBad(photos[i]), n > 1 ? step(1) : onClose(0))} />
      {n > 1 && (
        <>
          <button type="button" className="gl-arrow big prev" onClick={() => step(-1)} aria-label={t("Previous photo")}>‹</button>
          <button type="button" className="gl-arrow big next" onClick={() => step(1)} aria-label={t("Next photo")}>›</button>
          <div className="gl-thumbs">
            {photos.map((u, k) => (
              <button key={u} type="button" className={k === i ? "on" : ""} onClick={() => setI(k)} aria-label={t("Photo {i} of {n} — open full screen", { i: fmtNum(k + 1), n: fmtNum(n) })} aria-current={k === i || undefined}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={u} alt="" loading="lazy" referrerPolicy="no-referrer" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
