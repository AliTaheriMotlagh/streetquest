"use client";
// The List view's summary strip (the numbers: lib/insights.ts): a glance at what the list holds,
// drawn in SVG and CSS (nothing to download), above the results and only in the List view.
//  - stores: how many, a ring of how many are open now, deals, the average rating, and one bar of
//    what kinds of stores they are — a tap on a kind filters the list to it;
//  - products: the cheapest and the middle price, how many are discounted (and the best cut), and a
//    histogram of prices — a tap on a bar caps the price there (again: lifts the cap).
// Styles: app/list.css (.ins-*). Still when the device asks for less motion.
import type { CSSProperties, ReactNode } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { formatDistance } from "@/lib/geo";
import { REST, type Bands, type ProductGlance, type Share, type StoreGlance } from "@/lib/insights";

function Ring({ pct, color }: { pct: number; color: string }) {
  const r = 15, c = 2 * Math.PI * r;
  return (
    <svg className="ins-ring" viewBox="0 0 36 36" aria-hidden>
      <circle cx="18" cy="18" r={r} className="ins-ring-bg" />
      <circle cx="18" cy="18" r={r} className="ins-ring-fg" style={{ stroke: color, strokeDasharray: `${(Math.max(0, Math.min(100, pct)) / 100) * c} ${c}` }} />
    </svg>
  );
}

function Tile({ label, value, sub, art, tone }: { label: string; value: ReactNode; sub?: ReactNode; art?: ReactNode; tone?: string }) {
  return (
    <div className="ins-tile" style={tone ? ({ "--tone": tone } as CSSProperties) : undefined}>
      {art}
      <span className="ins-tile-txt">
        <b>{value}</b>
        <small>{label}</small>
        {sub && <em>{sub}</em>}
      </span>
    </div>
  );
}

export type Seg<K extends string> = Share<K> & { label: string; color: string; emoji?: string; on?: boolean };

/** One bar of segments (a legend of chips under it); tapping a segment or its chip calls `onPick`. */
export function ShareBar<K extends string>({ title, segs, onPick }: { title: string; segs: Seg<K>[]; onPick?: (k: K) => void }) {
  // One segment says nothing a bar could show.
  if (segs.length < 2) return null;
  const pick = (k: K | typeof REST) => k !== REST && onPick?.(k as K);
  return (
    <div className="ins-share" role="group" aria-label={title}>
      <div className="ins-share-bar">
        {segs.map((s) => (
          <button key={s.key} type="button" className={s.on ? "on" : ""} style={{ flexGrow: s.pct, background: s.color }} title={`${s.label} · ${fmtNum(s.n)}`} aria-label={`${s.label} ${fmtNum(s.n)}`} disabled={s.key === REST} onClick={() => pick(s.key)} />
        ))}
      </div>
      <div className="ins-legend">
        {segs.map((s) => (
          <button key={s.key} type="button" className={s.on ? "on" : ""} disabled={s.key === REST} onClick={() => pick(s.key)}>
            <i style={{ background: s.color }} />
            {s.emoji && <span aria-hidden>{s.emoji}</span>}
            <span>{s.label}</span>
            <b>{fmtNum(Math.round(s.pct))}%</b>
          </button>
        ))}
      </div>
    </div>
  );
}

/** The stores at a glance. */
export function StoreInsights({ g, kinds }: { g: StoreGlance; kinds: ReactNode }) {
  if (!g.total) return null;
  const openPct = g.known ? (g.open / g.known) * 100 : 0;
  return (
    <section className="ins" aria-label={t("At a glance")}>
      <div className="ins-tiles">
        <Tile label={t("Stores")} value={fmtNum(g.total)} sub={g.nearM != null ? t("nearest {d}", { d: formatDistance(g.nearM) }) : undefined} tone="var(--gold)" art={<span className="ins-glyph" aria-hidden>🏪</span>} />
        {g.known > 0 && <Tile label={t("Open now")} value={fmtNum(g.open)} sub={t("{p}% of those with hours", { p: fmtNum(Math.round(openPct)) })} tone="var(--green)" art={<Ring pct={openPct} color="var(--green)" />} />}
        {g.deals > 0 && <Tile label={t("With deals")} value={fmtNum(g.deals)} tone="var(--rose)" art={<span className="ins-glyph" aria-hidden>%</span>} />}
        {g.rated > 0 && <Tile label={t("Average rating")} value={`★ ${fmtNum(g.avgRating)}`} sub={t("{n} rated", { n: fmtNum(g.rated) })} tone="var(--yellow)" art={<Ring pct={(g.avgRating / 5) * 100} color="var(--yellow)" />} />}
      </div>
      {kinds}
    </section>
  );
}

/** The products at a glance, with the price histogram (`onCap`: cap the price at a band's top; `cap` the cap now). */
export function ProductInsights({ g, bands, money, cap, onCap, sources }: { g: ProductGlance; bands: Bands | null; money: (n: number) => string; cap: number; onCap: (to: number) => void; sources: ReactNode }) {
  if (!g.total) return null;
  return (
    <section className="ins" aria-label={t("At a glance")}>
      <div className="ins-tiles">
        {g.priced > 0 && <Tile label={t("Cheapest")} value={money(g.cheapest)} tone="var(--green)" art={<span className="ins-glyph" aria-hidden>↓</span>} />}
        {g.priced > 2 && <Tile label={t("Typical price")} value={money(g.median)} sub={t("half cost less")} tone="var(--sky)" art={<span className="ins-glyph" aria-hidden>≈</span>} />}
        {g.discounted > 0 && <Tile label={t("Discounted")} value={fmtNum(g.discounted)} sub={t("up to {p}% off", { p: fmtNum(g.bestOff) })} tone="var(--rose)" art={<Ring pct={(g.discounted / g.total) * 100} color="var(--rose)" />} />}
        {g.stores > 1 && <Tile label={t("Stores")} value={fmtNum(g.stores)} tone="var(--gold)" art={<span className="ins-glyph" aria-hidden>🏪</span>} />}
      </div>
      {bands && (
        <div className="ins-hist" role="group" aria-label={t("Prices")}>
          <div className="ins-hist-bars">
            {bands.bands.map((b, i) => {
              const on = cap > 0 && b.to <= cap;
              return (
                <button
                  key={i}
                  type="button"
                  className={`${on ? "on" : ""}${b.from <= bands.median && bands.median < b.to ? " mid" : ""}`}
                  style={{ "--h": `${Math.max(4, (b.n / bands.peak) * 100)}%`, "--i": i } as CSSProperties}
                  title={t("{n} between {a} and {b}", { n: fmtNum(b.n), a: money(b.from), b: money(b.to) })}
                  aria-label={t("Under {n}", { n: money(b.to) })}
                  aria-pressed={cap === b.to}
                  onClick={() => onCap(cap === b.to ? 0 : b.to)}
                >
                  <i />
                </button>
              );
            })}
          </div>
          <div className="ins-hist-axis">
            <span>{money(bands.bands[0].from)}</span>
            <span className="muted">{cap ? t("Under {n}", { n: money(cap) }) : t("Tap a bar to cap the price")}</span>
            <span>{money(bands.bands[bands.bands.length - 1].to)}</span>
          </div>
        </div>
      )}
      {sources}
    </section>
  );
}
