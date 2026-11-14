"use client";
// A real store's menu, catalog and prices from other sites (Snappfood; Torob — only the
// store's own: its Torob shop's catalog, or what a walk-in store was seen selling at its
// own prices), its hours, reviews, picture,
// contacts and links, inside the map cards (real places, businesses, Market shops), for
// Snappfood vendors and Torob's walk-in stores on the map; and the Divar ads pinned on
// each neighbourhood. Data: /api/local (server/localData.ts).
//
// Every store card has one phone-first shape: a compact head (logo, name, rating, open
// now), a short cover, the actions in one row, then tabs that stick to the top of the
// sheet while scrolling (Menu / Reviews / Info, or Catalog / Info) with compact rows.
import { useEffect, useMemo, useRef, useState } from "react";
import { menuSearch, storeKind, USUALLY } from "@/lib/storeKinds";
import { createPortal } from "react-dom";
import { fmtNum, msg, t } from "@/lib/i18n";
import { distanceM, formatDistance, type LatLng } from "@/lib/geo";
import {
  clockOf, dayClock, DIVAR_CAT_KEYS, DIVAR_CATS, LINK_CHECKS, openState, phoneKey, phoneSearchLinks, snappfoodMenuUrl, VENDOR_KINDS, WEEK_DAYS, weekFromOsm, zoneOf,
  type Deal, type DealInfo, type DealProduct, type DealReviewPage, type DivarArea, type DivarCat, type DivarDetail, type DivarPost, type Menu, type MenuItem, type Review, type ReviewPage, type StoreData, type StorePhone, type TorobItem, type TorobPlace, type TorobPlaceInfo, type TorobShop, type TorobStock, type Vendor, type Week,
} from "@/lib/localData";
import { cinemaUrl, showTime, tehranDay, type Cinema, type CinemaShows, type Film } from "@/lib/cinema";
import { Button } from "@/components/Button";
import { api, fmtTime } from "./client";
import { Directions } from "./Play";
import { MoveIcon, Sheet, useGame } from "./ui";
import { Icon } from "../drive/icons";
import { SiktirBar } from "./Siktir";

/**
 * GET /api/local with these params; null while loading, and the error if it failed. A
 * failure is retried once by itself after a moment (the store sites behind the Iran relay
 * drop out for a few seconds now and then); `retry` asks again on demand.
 */
export function useLocal<T>(params: Record<string, string | number | undefined> | null) {
  const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString() : null;
  const [state, setState] = useState<{ qs: string | null; data: T | null; error: string | null }>({ qs: null, data: null, error: null });
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!qs) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    // The 3D city's store chip and its sheet ask for the same store: one request between them.
    const hit = tries === 0 ? LOCAL_CACHE.get(qs) : undefined;
    const load = (again: boolean) =>
      (hit && Date.now() - hit.at < LOCAL_CACHE_MS ? Promise.resolve(hit.data as T) : api<T>(`/api/local?${qs}`))
        .then((data) => (LOCAL_CACHE.set(qs, { at: Date.now(), data }), live && setState({ qs, data, error: null })))
        .catch((e) => {
          if (!live) return;
          if (again) timer = setTimeout(() => void load(false), AUTO_RETRY_MS);
          else setState({ qs, data: null, error: (e as Error).message });
        });
    void load(true);
    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, [qs, tries]);
  const retry = () => {
    setState({ qs: null, data: null, error: null });
    setTries((n) => n + 1);
  };
  return { ...(state.qs === qs ? state : { qs, data: null, error: null }), retry };
}
const LOCAL_CACHE = new Map<string, { at: number; data: unknown }>();
const LOCAL_CACHE_MS = 60_000;
/** A failed store lookup asks once more by itself after this long. */
const AUTO_RETRY_MS = 1500;

const toman = (n: number) => t("{n} toman", { n: fmtNum(n) });
const LINK_ICON = { snappfood: "🍽️", torob: "🏷️", divar: "📢", website: "🌐", phone: "📞", instagram: "📸", directory: "🗂️" } as const;
/** "09:30" in the player's digits. */
const clock = (min: number) => clockOf(min).replace(/\d/g, (d) => fmtNum(Number(d)));
const spanText = ([a, b]: [number, number]) => `${clock(a)}–${clock(b > 1440 ? b - 1440 : b)}`;
const telOf = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** Which store a card is about (to look its number up). */
type StoreRef = { name: string; lat: number; lng: number; city?: string };

/**
 * The store's phones: the ones the card came with (every source's, each once), else a second,
 * longer lookup on the other maps (Balad, Google, OpenStreetMap). `looking` while that runs;
 * [] when nobody knows one.
 */
function usePhones(store: StoreRef | null, known: StorePhone[] | undefined) {
  const ask = !known?.length && store?.name ? { phone: "1", name: store.name, lat: store.lat.toFixed(6), lng: store.lng.toFixed(6) } : null;
  const { data, error } = useLocal<{ phone: string; phones?: StorePhone[] }>(ask);
  const phones = known?.length ? known : (data?.phones ?? []);
  return { phones, looking: !!ask && !data && !error };
}
/** Who had the number. */
const sourceName = (s: StorePhone["source"]) => (s === "balad" ? t("Balad") : s === "torob" ? t("Torob") : s === "snappfood" ? t("Snappfood") : s === "google" ? t("Google") : s === "takhfifan" ? t("Takhfifan") : s === "irangaah" ? t("Irangaah") : s === "netbarg" ? t("Netbarg") : t("Map"));
/** One number to tap: a mobile or a landline, and where it was read. */
function PhoneLink({ p }: { p: StorePhone }) {
  return (
    <a className="info-row link phone-row" href={telOf(p.number)}>
      {phoneKey(p.number).startsWith("9") ? "📱" : "📞"} <span dir="ltr" className="phone-num">{p.number}</span>
      <span className="tag phone-src">{sourceName(p.source)}</span>
    </a>
  );
}

/**
 * "Call" in the actions row: the number (several open a list to pick from), a spinner while
 * it's looked up, else where to find it.
 */
export function CallButton({ store, phones: known }: { store: StoreRef | null; phones?: StorePhone[] }) {
  const { phones, looking } = usePhones(store, known);
  if (phones.length === 1) return <a className="btn small ghost ext-link ext-phone" href={telOf(phones[0].number)}>📞 {t("Call")}</a>;
  if (phones.length)
    return (
      <details className="call-menu">
        <summary className="btn small ghost ext-link ext-phone">
          📞 {t("Call")} <span className="call-count">{fmtNum(phones.length)}</span>
        </summary>
        <div className="call-list">
          {phones.map((p) => <PhoneLink key={p.number} p={p} />)}
        </div>
      </details>
    );
  if (looking) return <span className="btn small ghost ext-link ext-phone is-looking" aria-busy="true">📞 …</span>;
  if (!store?.name) return null;
  return <a className="btn small ghost ext-link ext-phone-find" href={phoneSearchLinks(store.name, store.city).web} target="_blank" rel="noopener noreferrer">🔎 {t("Find the number")}</a>;
}

/** The phones in Info: every number with its source, else links to look one up (Google first, then Balad). */
function PhoneRows({ store, phones: known }: { store: StoreRef | null; phones?: StorePhone[] }) {
  const { phones, looking } = usePhones(store, known);
  if (phones.length)
    return (
      <section className="store-phones">
        {phones.length > 1 && <h4>📞 {t("Phone numbers ({n})", { n: fmtNum(phones.length) })}</h4>}
        {phones.map((p) => <PhoneLink key={p.number} p={p} />)}
      </section>
    );
  if (looking) return <div className="info-row muted">📞 {t("Looking up the phone number…")}</div>;
  if (!store?.name) return null;
  const l = phoneSearchLinks(store.name, store.city);
  return (
    <div className="info-row">
      📞 <span className="muted">{t("No phone number listed.")}</span>{" "}
      <a href={l.web} target="_blank" rel="noopener noreferrer">{t("Search Google")}</a>
      {" · "}
      <a href={l.balad} target="_blank" rel="noopener noreferrer">{t("Search Balad")}</a>
    </div>
  );
}

/** A picture that quietly goes away when it can't load (a dead link, a blocked CDN). */
export function Pic({ src, className }: { src: string; className?: string }) {
  const [bad, setBad] = useState(false);
  if (!src || bad) return null;
  return <img className={className} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setBad(true)} />;
}

/** In-app route there with live traffic (drawn on the map), when routing works. */
export function RouteButton({ to, name, className = "btn small cyan" }: { to: LatLng; name?: string; className?: string }) {
  const { navigate } = useGame();
  if (!navigate) return null;
  return <Button className={className} onClick={() => navigate({ lat: to.lat, lng: to.lng, name })}>🧭 {t("Route")}</Button>;
}

// ---------------------------------------------------------------- hours
/** Open now or closed, and the next change today ("until 22:00", "opens 11:30"), in the store's own time zone. */
export function OpenBadge({ week, at }: { week: Week | null | undefined; at: LatLng }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  if (!week) return null;
  const s = openState(week, now, zoneOf(at));
  const next = s.next == null ? "" : ` · ${s.open ? t("until {time}", { time: clock(s.next) }) : t("opens {time}", { time: clock(s.next) })}`;
  return <span className={`tag open-badge ${s.open ? "is-open" : "is-closed"}`}>{s.open ? `🟢 ${t("Open now")}` : `🔴 ${t("Closed now")}`}{next}</span>;
}

/** The whole week, Saturday first, today marked. */
function HoursTable({ week, at }: { week: Week; at: LatLng }) {
  const today = dayClock(new Date(), zoneOf(at)).day;
  return (
    <table className="hours-table">
      <tbody>
        {week.map((spans, d) => (
          <tr key={d} className={d === today ? "today" : ""}>
            <th scope="row">{t(WEEK_DAYS[d])}</th>
            <td dir="ltr">{spans.length ? (spans.length === 1 && spans[0][0] === 0 && spans[0][1] === 1440 ? t("Open 24 hours") : spans.map(spanText).join("  ·  ")) : t("Closed")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

type InfoProps = { at: LatLng; store?: StoreRef | null; week?: Week | null; hours?: string; address?: string; area?: string; phones?: StorePhone[]; city?: string; minOrder?: number; deliveryFee?: number };
/** Hours, address, phone (or where to find it), delivery terms: whatever is known, else a line saying so. */
export function InfoView({ at, store = null, week, hours, address, area, phones, city, minOrder, deliveryFee }: InfoProps) {
  const empty = !week && !hours && !address && !phones?.length && !store?.name;
  return (
    <div className="store-info">
      {week ? (
        <section>
          <h4>🕒 {t("Hours")}</h4>
          <HoursTable week={week} at={at} />
        </section>
      ) : (
        hours && (
          <div className="info-row">
            🕒 <span dir="ltr" className="ext-hours">{hours}</span>
          </div>
        )
      )}
      {address && (
        <div className="info-row">
          🏠 <span dir="auto">{[address, area, city].filter(Boolean).join(" · ")}</span>
        </div>
      )}
      <PhoneRows store={store} phones={phones} />
      {!!minOrder && <div className="info-row">🧾 {t("Minimum order: {price}", { price: toman(minOrder) })}</div>}
      {deliveryFee != null && <div className="info-row">🛵 {deliveryFee ? t("Delivery: {price}", { price: toman(deliveryFee) }) : t("Free delivery")}</div>}
      {empty && <p className="small muted">{t("No hours, address or phone known for this store yet.")}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- tabs
type Tab = { key: string; label: string; body: () => React.ReactNode };
/** The card's sections, one at a time; the bar sticks to the top of the sheet while scrolling. */
export function StoreTabs({ tabs }: { tabs: Tab[] }) {
  const [on, setOn] = useState(tabs[0]?.key);
  const cur = tabs.find((x) => x.key === on) ?? tabs[0];
  if (!cur) return null;
  return (
    <div className="store-tabs-wrap">
      {tabs.length > 1 && (
        <div className="tabs store-tabs" role="tablist">
          {tabs.map((x) => (
            <button key={x.key} role="tab" aria-selected={x.key === cur.key} className={x.key === cur.key ? "on" : ""} onClick={() => setOn(x.key)}>
              {x.label}
            </button>
          ))}
        </div>
      )}
      <div role="tabpanel">{cur.body()}</div>
    </div>
  );
}

// ---------------------------------------------------------------- menu
/** Prices as the menu shows them: the price now, the old one struck through. */
function MenuPrice({ price, priceNow }: { price: number; priceNow: number }) {
  return (
    <span className="price-tag">
      <b>{toman(priceNow)}</b>
      {priceNow < price && <s>{fmtNum(price)}</s>}
    </span>
  );
}

/** One item of a menu, tapped: its picture, all of its description, its price, and where to order it. */
function MenuItemView({ item, menu, onBack }: { item: MenuItem; menu: Menu; onBack: () => void }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => el.current?.scrollIntoView({ block: "nearest" }), []);
  const pic = item.image || item.photo;
  const off = item.price > 0 && item.priceNow < item.price ? Math.round((1 - item.priceNow / item.price) * 100) : 0;
  return (
    <div className="ext-dish" ref={el}>
      <button className="btn small ghost ext-dish-back" onClick={onBack}>
        ↩ {t("Back to the menu")}
      </button>
      {pic ? <Pic src={pic} className="ext-dish-img" /> : <div className="ext-dish-ph">{VENDOR_KINDS[menu.vendor.kind].emoji}</div>}
      <h3 dir="auto">{item.title}</h3>
      {item.about && <p className="muted ext-dish-about" dir="auto">{item.about}</p>}
      <span className="price-tag big">
        <b>{toman(item.priceNow)}</b>
        {off > 0 && (
          <>
            <s>{fmtNum(item.price)}</s>
            <span className="deal-pill">{t("−{n}%", { n: off })}</span>
          </>
        )}
      </span>
      <a className="btn yellow block" href={snappfoodMenuUrl(menu.vendor.code)} target="_blank" rel="noopener noreferrer">
        🍽️ {t("Order on Snappfood")}
      </a>
    </div>
  );
}

/** A Snappfood menu (restaurant) or catalog (supermarket, bakery…), one section at a time; an item opens on a tap. */
export function MenuView({ menu }: { menu: Menu }) {
  const [tab, setTab] = useState(0);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<MenuItem | null>(null);
  const kind = VENDOR_KINDS[menu.vendor.kind];
  const needle = q.trim().toLowerCase();
  const items = needle
    ? menu.sections.flatMap((s) => s.items).filter((i, n, all) => i.title.toLowerCase().includes(needle) && all.findIndex((x) => x.id === i.id) === n)
    : menu.sections[Math.min(tab, menu.sections.length - 1)]?.items ?? [];
  if (open) return <MenuItemView item={open} menu={menu} onBack={() => setOpen(null)} />;
  return (
    <div className="ext-menu">
      {menu.sections.reduce((n, s) => n + s.items.length, 0) > 12 && (
        <input className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search the menu")} aria-label={t("Search the menu")} />
      )}
      {!needle && menu.sections.length > 1 && (
        <div className="tabs ext-sections" role="tablist">
          {menu.sections.map((s, i) => (
            <button key={`${s.title}${i}`} role="tab" aria-selected={i === tab} className={i === tab ? "on" : ""} onClick={() => setTab(i)} dir="auto">
              {s.title || t("More")}
            </button>
          ))}
        </div>
      )}
      <div className="ext-items compact">
        {items.map((i) => (
          <button key={i.id} type="button" className="ext-item tap" onClick={() => setOpen(i)}>
            {i.photo ? <img src={i.photo} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ext-ph">{kind.emoji}</span>}
            <div className="grow">
              <b dir="auto">{i.title}</b>
              {i.about && <p className="small muted" dir="auto">{i.about}</p>}
            </div>
            <MenuPrice price={i.price} priceNow={i.priceNow} />
          </button>
        ))}
        {!items.length && <div className="empty">{t("Nothing matches")}</div>}
      </div>
      <p className="small muted ext-source">{t("From Snappfood · updated {when}", { when: fmtTime(menu.fetchedAt) })}</p>
    </div>
  );
}

// ---------------------------------------------------------------- reviews
/** How the stars split (Snappfood gives each share in %), five down to one. */
function StarBars({ stars, total }: { stars: number[]; total?: number }) {
  const sum = stars.reduce((a, b) => a + b, 0) || 1;
  const avg = stars.reduce((a, n, i) => a + n * (i + 1), 0) / sum;
  return (
    <div className="star-bars">
      <div className="star-avg">
        <b>{fmtNum(Math.round(avg * 10) / 10)}</b>
        <span aria-hidden>{"★".repeat(Math.round(avg))}</span>
        {!!total && <span className="small muted">{t("{n} reviews", { n: fmtNum(total) })}</span>}
      </div>
      <div className="grow">
        {[4, 3, 2, 1, 0].map((i) => (
          <div key={i} className="star-row">
            <span className="small">{fmtNum(i + 1)}★</span>
            <i style={{ ["--w" as string]: `${Math.round((stars[i] / sum) * 100)}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ReviewRow({ r }: { r: Review }) {
  return (
    <div className="review">
      <div className="review-top">
        <b dir="auto">{r.who || t("A customer")}</b>
        <span className="review-stars" role="img" aria-label={t("{n} of 5 stars", { n: fmtNum(r.rate) })}>
          {"★".repeat(r.rate)}
          <span className="dim">{"★".repeat(5 - r.rate)}</span>
        </span>
        <span className="grow" />
        <span className="small muted" dir="auto">{r.date}</span>
      </div>
      {r.text && <p dir="auto">{r.text}</p>}
      {!!r.foods.length && <p className="small muted" dir="auto">🍽️ {r.foods.join("، ")}</p>}
      {r.reply && <p className="small review-reply" dir="auto">↩️ {r.reply}</p>}
    </div>
  );
}

function ReviewsPage({ code, page, last, onMore }: { code: string; page: number; last: boolean; onMore: () => void }) {
  const { data, error } = useLocal<{ reviews: ReviewPage }>({ reviews: code, page });
  if (error) return <p className="small warn-text">{error}</p>;
  if (!data) return <p className="small muted">{t("Loading…")}</p>;
  const { reviews, count } = data.reviews;
  if (!reviews.length) return page === 0 ? <p className="small muted">{t("No reviews yet")}</p> : null;
  return (
    <>
      {reviews.map((r) => (
        <ReviewRow key={r.id} r={r} />
      ))}
      {last && (page + 1) * reviews.length < count && (
        <Button className="btn small ghost block" onClick={onMore}>
          {t("More reviews")}
        </Button>
      )}
    </>
  );
}

/** A vendor's reviews: the star split, then the newest first, ten more at a time. */
function ReviewsView({ code, total, stars }: { code: string; total?: number; stars?: number[] }) {
  const [pages, setPages] = useState(1);
  return (
    <div className="reviews">
      {stars && stars.some(Boolean) && <StarBars stars={stars} total={total} />}
      {Array.from({ length: pages }, (_, i) => (
        <ReviewsPage key={i} code={code} page={i} last={i === pages - 1} onMore={() => setPages((n) => Math.min(n + 1, 20))} />
      ))}
      <p className="small muted ext-source">{t("Reviews from Snappfood customers")}</p>
    </div>
  );
}

// ---------------------------------------------------------------- product page
/**
 * A product or ad from another site (a Divar ad, a store's product on Torob). Tapping one
 * opens its page here first — its photos, price, details and (for Divar) the whole ad with
 * its facts and description — and only its button goes on to the site itself.
 */
type Product = { source: "divar" | "torob" | "takhfifan" | "basalam" | "snappfood"; title: string; price: string; photo: string; url: string; lines: (string | false | undefined)[]; token?: string; photos?: string[]; desc?: string; terms?: string };
const SOURCE = { divar: { name: msg("Divar"), open: msg("Open on Divar") }, torob: { name: msg("Torob"), open: msg("Open on Torob") }, takhfifan: { name: msg("Takhfifan"), open: msg("Buy on Takhfifan") }, basalam: { name: msg("Basalam"), open: msg("Open on Basalam") }, snappfood: { name: msg("Snappfood"), open: msg("Order on Snappfood") } } as const;
/** A product's page (ProductSearch opens Torob / Basalam / Takhfifan hits in it). */
export type ExtProduct = Product;

/** A list row that opens the product's page. */
function ProductRow({ product, children }: { product: Product; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="ext-item tap" onClick={() => setOpen(true)}>
        {children}
      </button>
      {open && <ProductPage p={product} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ProductPage({ p, onClose }: { p: Product; onClose: () => void }) {
  const { pos } = useGame();
  const detail = useLocal<{ post: DivarDetail | null }>(p.source === "divar" && p.token ? { divarPost: p.token } : null);
  const d = detail.data?.post ?? null;
  const photos = d?.photos.length ? d.photos : p.photos?.length ? p.photos : p.photo ? [p.photo] : [];
  const text = d?.description || p.desc || "";
  const [shot, setShot] = useState(0);
  const strip = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  const onStrip = () => {
    const el = strip.current;
    if (el) setShot(Math.round(Math.abs(el.scrollLeft) / Math.max(1, el.clientWidth)));
  };
  const lines = p.lines.filter((x): x is string => !!x);
  const far = d?.at && pos ? distanceM(pos, d.at) : null;
  const share = typeof navigator !== "undefined" && "share" in navigator;
  const src = SOURCE[p.source];
  const long = text.length > 360;
  return createPortal(
    <div className="pp" role="dialog" aria-modal="true" aria-label={p.title} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`pp-card pp-${p.source}`}>
        <header className="pp-bar">
          <button type="button" className="pp-icon" onClick={onClose} aria-label={t("Back")}>
            <Icon name="back" size={20} className="pp-back" />
          </button>
          <span className="pp-src">{t(src.name)}</span>
          {share && (
            <button type="button" className="pp-icon" onClick={() => void navigator.share({ title: p.title, url: p.url }).catch(() => {})} aria-label={t("Share")}>
              <Icon name="share" size={19} />
            </button>
          )}
        </header>
        <div className="pp-scroll">
          {photos.length > 0 && (
            <div className="pp-gallery">
              <div className="pp-strip" ref={strip} onScroll={onStrip}>
                {photos.map((u) => (
                  <Pic key={u} src={u} />
                ))}
              </div>
              {photos.length > 1 && (
                <span className="pp-count">
                  {fmtNum(shot + 1)} / {fmtNum(photos.length)}
                </span>
              )}
            </div>
          )}
          <div className="pp-main">
            <h3 dir="auto">{d?.title || p.title}</h3>
            {p.price && (
              <p className="pp-price" dir="auto">
                {p.price}
              </p>
            )}
            {(lines.length > 0 || d?.posted || far != null) && (
              <ul className="pp-meta">
                {lines.map((l) => (
                  <li key={l} dir="auto">
                    <Icon name="tag" size={15} /> {l}
                  </li>
                ))}
                {d?.posted && (
                  <li dir="auto">
                    <Icon name="clock" size={15} /> {d.posted}
                  </li>
                )}
                {far != null && (
                  <li>
                    <Icon name="pin" size={15} /> {d!.at!.radius ? t("About {d} from you", { d: formatDistance(far) }) : t("{d} from you", { d: formatDistance(far) })}
                  </li>
                )}
              </ul>
            )}
            {p.source === "divar" && !d && !detail.error && <p className="small muted pp-loading">{t("Loading…")}</p>}
            {!!d?.facts.length && (
              <dl className="pp-facts">
                {d.facts.map((f) => (
                  <div key={f.title + f.value}>
                    <dt dir="auto">{f.title}</dt>
                    <dd dir="auto">{f.value}</dd>
                  </div>
                ))}
              </dl>
            )}
            {!!d?.features.length && (
              <div className="pp-chips">
                {d.features.map((f) => (
                  <span key={f} dir="auto">
                    {f}
                  </span>
                ))}
              </div>
            )}
            {text && (
              <section className="pp-desc">
                <h4>{t("Description")}</h4>
                <p dir="auto" className={long && !more ? "clamp" : ""}>
                  {text}
                </p>
                {long && (
                  <button type="button" className="pp-more" onClick={() => setMore((m) => !m)}>
                    {more ? t("Show less") : t("Show more")}
                  </button>
                )}
              </section>
            )}
            {p.terms && (
              <section className="pp-desc">
                <h4>{t("Terms")}</h4>
                <p dir="auto">{p.terms}</p>
              </section>
            )}
          </div>
        </div>
        <footer className="pp-foot">
          <a className="pp-go" href={p.url} target="_blank" rel="noopener noreferrer">
            {t(src.open)}
            <Icon name="external" size={17} />
          </a>
          <p>{t("Opens {site} in a new tab — the game keeps your place.", { site: t(src.name) })}</p>
        </footer>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Torob
/**
 * A store's products on Torob. A row whose price is Torob's lowest anywhere (`from`: a
 * shop catalog lists the best price, not necessarily this store's) says so.
 */
function TorobList({ items }: { items: TorobItem[] }) {
  return (
    <div className="ext-items compact">
      {items.map((i) => (
        <ProductRow key={i.url} product={{ source: "torob", title: i.title, photo: i.photo, url: i.url, price: i.price > 0 ? (i.from ? t("from {n} toman", { n: fmtNum(i.price) }) : toman(i.price)) : "", lines: [i.from ? t("Lowest price on Torob") : ""] }}>
          {i.photo ? <img src={i.photo} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ext-ph">🏷️</span>}
          <div className="grow">
            <b dir="auto">{i.title}</b>
            {i.from && <p className="small muted">{t("Lowest price on Torob")}</p>}
          </div>
          {i.price > 0 ? <span className="price-tag"><b>{i.from ? t("from {n} toman", { n: fmtNum(i.price) }) : toman(i.price)}</b></span> : <span className="small muted">{t("Out of stock")}</span>}
        </ProductRow>
      ))}
    </div>
  );
}

/** What a walk-in store was seen selling on Torob's map of sellers, at its own prices. */
function StockList({ items }: { items: TorobStock[] }) {
  return (
    <div className="ext-items compact">
      {items.map((i) => (
        <ProductRow key={i.url} product={{ source: "torob", title: i.title, photo: i.photo, url: i.url, price: i.price > 0 ? toman(i.price) : t("Ask in the store"), lines: [i.note, i.when && t("price changed {when}", { when: i.when })] }}>
          {i.photo ? <img src={i.photo} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ext-ph">🏷️</span>}
          <div className="grow">
            <b dir="auto">{i.title}</b>
            {(i.note || i.when) && <p className="small muted" dir="auto">{[i.note, i.when && t("price changed {when}", { when: i.when })].filter(Boolean).join(" · ")}</p>}
          </div>
          {i.price > 0 ? <span className="price-tag"><b>{toman(i.price)}</b></span> : <span className="small muted">{t("Ask in the store")}</span>}
        </ProductRow>
      ))}
    </div>
  );
}

/**
 * A store's own products on Torob: its shop's catalog (with a search that stays inside
 * that shop), or the listings only it sells. Never other stores' products.
 */
function TorobSearch({ initial, shop, title }: { initial?: TorobItem[]; shop?: TorobShop | null; title?: string }) {
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const res = useLocal<{ items: TorobItem[] }>(q && shop ? { torob: q, shop: shop.id } : null);
  return (
    <div className="ext-torob">
      <div className="sec-head">
        {shop?.logo && <img className="ext-shop-logo" src={shop.logo} alt="" referrerPolicy="no-referrer" />}
        <b dir="auto">🏷️ {title ?? (shop ? t("{shop} on Torob", { shop: shop.name }) : t("This store on Torob"))}</b>
        <span className="grow" />
        {!!shop?.count && <span className="small muted">{t("{n} products", { n: fmtNum(shop.count) })}</span>}
      </div>
      {shop && (
        <form className="row" onSubmit={(e) => (e.preventDefault(), setQ(draft.trim()))}>
          <input className="input grow" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("Search this store's products")} aria-label={t("Search this store's products")} maxLength={60} />
          <Button className="btn cyan" disabled={draft.trim().length < 2}>🔎</Button>
        </form>
      )}
      {q ? (
        res.error ? <p className="small warn-text">{res.error}</p> : !res.data ? <p className="small muted">{t("Loading…")}</p> : res.data.items.length ? <TorobList items={res.data.items} /> : <p className="small muted">{t("This store has nothing like that on Torob")}</p>
      ) : (
        !!initial?.length && <TorobList items={initial} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- store cards
/**
 * Everything other sites know about a store, inside a place / business / Market shop
 * card: its links, then tabs — the menu or catalog, Torob, reviews, and its info.
 */
export function StoreExtras({ query, at, bare }: { query: Record<string, string | number | undefined>; at?: LatLng; /** No cover picture (the 3D city's sheet has its own carousel). */ bare?: boolean }) {
  const { data, error } = useLocal<StoreData>(query);
  if (error) return <p className="small muted">{error}</p>;
  if (!data) return <p className="small muted ext-loading">⏳ {t("Looking up the menu and prices…")}</p>;
  const a = data.about;
  const where = at ?? (data.menu ? data.menu.vendor : { lat: 0, lng: 0 });
  // Without a known spot there's nothing to look the number up by.
  const store: StoreRef | null = a.name && (at || data.menu) ? { name: a.name, lat: where.lat, lng: where.lng } : null;
  // The numbers have their own button (all of them), not a link each.
  const links = data.links.filter((l) => l.kind !== "phone");
  const phones = a.phones ?? [];
  const week = a.week ?? weekFromOsm(a.hours);
  const tabs: Tab[] = [];
  if (data.menu) tabs.push({ key: "menu", label: data.menu.vendor.kind === "market" ? `🛒 ${t("Catalog")}` : `🍽️ ${t("Menu")}`, body: () => <MenuView menu={data.menu!} /> });
  // Torob only for a store that's on it: its own shop, or listings only it sells.
  const onTorob = !!data.torobShop || data.torob.length > 0;
  if (onTorob) tabs.push({ key: "torob", label: `🏷️ ${t("Torob")}`, body: () => <TorobSearch initial={data.torob} shop={data.torobShop} /> });
  if (data.menu) tabs.push({ key: "reviews", label: `⭐ ${data.menu.reviews ? t("Reviews ({n})", { n: fmtNum(data.menu.reviews) }) : t("Reviews")}`, body: () => <ReviewsView code={data.menu!.vendor.code} total={data.menu!.reviews} stars={data.menu!.stars} /> });
  tabs.push({ key: "info", label: `ℹ️ ${t("Info")}`, body: () => <InfoView at={where} store={store} week={week} hours={a.hours} address={a.address} area={data.menu?.area} phones={phones} minOrder={data.menu?.minOrder} deliveryFee={data.menu?.deliveryFee} /> });
  return (
    <div className="ext-store">
      {!bare && (a.photo || a.logo) && (
        <div className="ext-cover">
          <Pic src={a.photo || a.logo} className="ext-cover-img" />
          {a.logo && a.photo && <Pic src={a.logo} className="ext-cover-logo" />}
        </div>
      )}
      {(week || data.menu) && (
        <div className="store-meta">
          <OpenBadge week={week} at={where} />
          {data.menu && data.menu.vendor.rating > 0 && <span className="tag ext-rating">⭐ {fmtNum(data.menu.vendor.rating)}</span>}
        </div>
      )}
      {(!!links.length || !!phones.length || store) && (
        <div className="store-actions ext-links">
          {links.map((l) => (
            <a key={l.url} className={`btn small ghost ext-link ext-${l.kind}`} href={l.url} target="_blank" rel="noopener noreferrer" dir="auto">
              {LINK_ICON[l.kind]} {l.label}
            </a>
          ))}
          <CallButton store={store} phones={phones} />
        </div>
      )}
      {at && query.id && <SiktirBar placeKey={query.store === "place" ? String(query.id) : `${query.store}:${query.id}`} name={a.name || String(query.name ?? "")} at={at} />}
      {!data.menu && !onTorob && <NoMenu name={a.name || String(query.name ?? "")} cls={String(query.cls ?? query.cat ?? "")} at={at ?? null} />}
      <StoreTabs tabs={tabs} />
    </div>
  );
}

/**
 * No menu online (most walk-in stores aren't on a delivery site): say so in one line, show what
 * this kind of store usually has, and two ways to find the real one — never a dead end.
 */
function NoMenu({ name, cls, at }: { name: string; cls: string; at: LatLng | null }) {
  const kind = storeKind(cls, name);
  const search = menuSearch(name, at);
  return (
    <div className="no-menu">
      <p className="small muted">{t("Their menu isn't online yet. Usually here:")}</p>
      <div className="no-menu-chips">
        {USUALLY[kind].map((w) => (
          <span key={w} className="chip small">{t(w)}</span>
        ))}
      </div>
      {!!search.length && (
        <div className="store-actions">
          {search.map((l) => (
            <a key={l.kind} className="btn small ghost" href={l.url} target="_blank" rel="noopener noreferrer">
              {l.kind === "web" ? "🔎" : "📍"} {t(l.label)}
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

/** The head every store card starts with: logo, name, what and how far, rating and open now. */
export function StoreHead({ logo, emoji, name, sub, rating, reviews, week, at }: { logo?: string; emoji: string; name: string; sub: string; rating?: number; reviews?: number; week?: Week | null; at: LatLng }) {
  const [bad, setBad] = useState(false);
  return (
    <div className="store-head">
      {logo && !bad ? <img className="store-logo" src={logo} alt="" referrerPolicy="no-referrer" onError={() => setBad(true)} /> : <div className="store-logo ph">{emoji}</div>}
      <div className="grow">
        <b dir="auto">{name}</b>
        <div className="small muted" dir="auto">{sub}</div>
        <div className="store-meta">
          {!!rating && <span className="tag ext-rating">⭐ {fmtNum(rating)}{reviews ? <span className="muted"> ({fmtNum(reviews)})</span> : null}</span>}
          <OpenBadge week={week} at={at} />
        </div>
      </div>
    </div>
  );
}

/** Get there: walk/teleport in test mode, the in-app route and maps apps, or drive the 3D city. */
export function GoButtons({ to, name, dist }: { to: LatLng; name: string; dist: number }) {
  const { teleport, drive } = useGame();
  return (
    <>
      {teleport ? (
        <Button className="btn small yellow" onClick={() => teleport(to)}>
          <MoveIcon /> {t("Go there")}
        </Button>
      ) : (
        dist > 150 && <RouteButton to={to} name={name} />
      )}
      {dist > 60 && <Directions to={to} name={name} className="btn small cyan" />}
      {drive && (
        <Button className="btn small cyan" onClick={() => drive(to)}>
          🚗 {t("Drive there")}
        </Button>
      )}
    </>
  );
}

/** A Snappfood vendor tapped on the map: menu, reviews and info in tabs. */
export function VendorCard({ v, onClose }: { v: Vendor; onClose: () => void }) {
  const { pos } = useGame();
  const kind = VENDOR_KINDS[v.kind];
  const dist = pos ? distanceM(pos, v) : Infinity;
  const { data, error, retry } = useLocal<{ menu: Menu }>({ menu: v.code, lat: v.lat.toFixed(5), lng: v.lng.toFixed(5) });
  const menu = data?.menu;
  const sub = [t(kind.label), Number.isFinite(dist) ? formatDistance(dist) : "", menu?.area ?? ""].filter(Boolean).join(" · ");
  return (
    <Sheet title={`${kind.emoji} ${v.title}`} onClose={onClose} tall>
      <StoreHead logo={v.logo} emoji={kind.emoji} name={v.title} sub={sub} rating={v.rating} reviews={menu?.reviews} week={menu?.week} at={v} />
      {v.about && <p className="small muted store-about" dir="auto">{v.about}</p>}
      {menu?.cover && <div className="ext-cover"><Pic src={menu.cover} className="ext-cover-img" /></div>}
      <div className="store-actions">
        <a className="btn small ghost ext-link ext-snappfood" href={snappfoodMenuUrl(v.code)} target="_blank" rel="noopener noreferrer">🍽️ {t("Order on Snappfood")}</a>
        {menu && <CallButton store={{ name: v.title, lat: v.lat, lng: v.lng }} phones={menu.phones} />}
        <GoButtons to={v} name={v.title} dist={dist} />
      </div>
      <SiktirBar placeKey={v.code} name={v.title} at={v} />
      {error ? (
        <div className="ext-error">
          <p className="small warn-text">{error}</p>
          <Button className="btn small cyan" onClick={retry}>🔄 {t("Try again")}</Button>
        </div>
      ) : menu ? (
        <StoreTabs
          tabs={[
            { key: "menu", label: v.kind === "market" ? `🛒 ${t("Catalog")}` : `🍽️ ${t("Menu")}`, body: () => <MenuView menu={menu} /> },
            { key: "reviews", label: `⭐ ${menu.reviews ? t("Reviews ({n})", { n: fmtNum(menu.reviews) }) : t("Reviews")}`, body: () => <ReviewsView code={v.code} total={menu.reviews} stars={menu.stars} /> },
            { key: "info", label: `ℹ️ ${t("Info")}`, body: () => <InfoView at={v} store={{ name: v.title, lat: v.lat, lng: v.lng }} week={menu.week} address={menu.address} area={menu.area} phones={menu.phones} minOrder={menu.minOrder} deliveryFee={menu.deliveryFee} /> },
          ]}
        />
      ) : (
        <p className="small muted ext-loading">⏳ {t("Looking up the menu and prices…")}</p>
      )}
    </Sheet>
  );
}

/** A walk-in Torob store tapped on the map: its own catalog (searchable) and its info. */
export function TorobPlaceCard({ p, onClose }: { p: TorobPlace; onClose: () => void }) {
  const { pos } = useGame();
  const dist = pos ? distanceM(pos, p) : Infinity;
  const { data, error } = useLocal<{ info: TorobPlaceInfo | null; items: TorobItem[]; stock: TorobStock[] }>({ torobPlace: p.id, lat: p.lat.toFixed(6), lng: p.lng.toFixed(6) });
  const info = data?.info;
  const shop = useMemo<TorobShop>(() => ({ id: p.id, name: p.name, logo: info?.logo ?? "", url: info?.url ?? `https://torob.com/shop/${p.id}/`, count: 0 }), [p, info]);
  const sub = [p.sells.join(" "), p.city, Number.isFinite(dist) ? formatDistance(dist) : ""].filter(Boolean).join(" · ");
  const photo = info?.photos[0] || p.photo;
  const stock = data?.stock ?? [];
  return (
    <Sheet title={`🏷️ ${p.name}`} onClose={onClose} tall>
      <StoreHead logo={info?.logo || p.photo} emoji="🏷️" name={p.name} sub={sub} week={p.week} at={p} />
      {photo && <div className="ext-cover"><Pic src={photo} className="ext-cover-img" /></div>}
      <div className="store-actions">
        <a className="btn small ghost ext-link ext-torob" href={shop.url} target="_blank" rel="noopener noreferrer">🏷️ {t("Shop on Torob")}</a>
        {data && <CallButton store={{ name: p.name, lat: p.lat, lng: p.lng, city: p.city }} phones={info?.phones} />}
        <GoButtons to={p} name={p.name} dist={dist} />
      </div>
      <SiktirBar placeKey={`torob:${p.id}`} name={p.name} at={p} />
      {error ? (
        <p className="small warn-text">{error}</p>
      ) : !data ? (
        <p className="small muted ext-loading">⏳ {t("Loading the store's catalog…")}</p>
      ) : (
        <StoreTabs
          tabs={[
            {
              key: "catalog",
              label: `🛍️ ${t("Catalog")}`,
              body: () => (
                <>
                  {!!stock.length && (
                    <div className="ext-torob">
                      <div className="sec-head">
                        <b>🏷️ {t("In this store, at its own prices")}</b>
                      </div>
                      <StockList items={stock} />
                    </div>
                  )}
                  {data.items.length ? <TorobSearch initial={data.items} shop={shop} title={stock.length ? t("More from this store on Torob") : undefined} /> : !stock.length && <p className="small muted">{t("This store lists no products on Torob right now.")}</p>}
                </>
              ),
            },
            { key: "info", label: `ℹ️ ${t("Info")}`, body: () => <InfoView at={p} store={{ name: p.name, lat: p.lat, lng: p.lng, city: p.city }} week={p.week} address={info?.address || p.address} city={p.city} phones={info?.phones} /> },
          ]}
        />
      )}
      <p className="small muted ext-source">{t("A walk-in store from Torob's map of sellers")}</p>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Divar
function DivarList({ posts }: { posts: DivarPost[] }) {
  return (
    <div className="ext-items compact">
      {posts.map((p) => (
        <ProductRow key={p.token} product={{ source: "divar", token: p.token, title: p.title, photo: p.photo, url: p.url, price: p.price, lines: [p.note, p.when] }}>
          {p.photo ? <img src={p.photo} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ext-ph">📢</span>}
          <div className="grow">
            <b dir="auto">{p.title}</b>
            <p className="small muted" dir="auto">{[p.note, p.when].filter(Boolean).join(" · ")}</p>
          </div>
          {p.price && <span className="price-tag" dir="auto"><b>{p.price}</b></span>}
        </ProductRow>
      ))}
    </div>
  );
}

/** A Divar neighbourhood tapped on the map: its latest ads, by category. */
export function DivarCard({ area, onClose }: { area: DivarArea; onClose: () => void }) {
  const [cat, setCat] = useState<DivarCat>("all");
  const res = useLocal<{ posts: DivarPost[] }>(cat === "all" ? null : { divar: area.id, city: area.city, cat });
  const posts = cat === "all" ? area.posts : res.data?.posts;
  return (
    <Sheet title={`📢 ${t("Divar · {area}", { area: area.name })}`} onClose={onClose} tall>
      <p className="small muted">{t("The latest ads people posted in {area} ({d} away).", { area: area.name, d: formatDistance(area.distanceM) })}</p>
      <div className="tabs ext-divar-tabs store-tabs" role="tablist">
        {DIVAR_CAT_KEYS.map((k) => (
          <button key={k} role="tab" aria-selected={k === cat} className={k === cat ? "on" : ""} onClick={() => setCat(k)}>
            {DIVAR_CATS[k].emoji} {t(DIVAR_CATS[k].label)}
          </button>
        ))}
      </div>
      {res.error ? <p className="small warn-text">{res.error}</p> : !posts ? <p className="small muted">{t("Loading…")}</p> : posts.length ? <DivarList posts={posts} /> : <p className="small muted">{t("No ads here right now")}</p>}
      <a className="btn small ghost ext-link ext-divar block" href={`https://divar.ir/s/${encodeURIComponent(area.citySlug || "iran")}${area.id ? `?districts=${area.id}` : ""}`} target="_blank" rel="noopener noreferrer">📢 {t("More on Divar")}</a>
      <p className="small muted ext-source">{t("From Divar · updated every 15 minutes")}</p>
    </Sheet>
  );
}

type Links = { snappfood: string; torob: string; divar: string };
/** Owner forms (Business center, Market shop): the store's own pages, which beat the automatic match. */
export function OwnerLinkFields({ v, set }: { v: Links; set: (k: keyof Links, value: string) => void }) {
  const bad = (k: keyof Links) => !LINK_CHECKS[k](v[k]);
  return (
    <fieldset className="owner-links">
      <legend className="small">🔗 {t("Your store on other sites")}</legend>
      <p className="small muted">{t("Players see your real menu, prices and ad right on your store. Leave empty and we'll look for your Snappfood menu by name and location.")}</p>
      <label>🍽️ {t("Snappfood menu link")}<input className="input" dir="ltr" inputMode="url" maxLength={300} placeholder="https://snappfood.ir/restaurant/menu/…" value={v.snappfood} onChange={(e) => set("snappfood", e.target.value)} /></label>
      {bad("snappfood") && <p className="small warn-text">{t("Paste your Snappfood menu link (snappfood.ir/…)")}</p>}
      <label>🏷️ {t("Torob shop link")}<input className="input" dir="ltr" inputMode="url" maxLength={300} placeholder="https://torob.com/shop/…" value={v.torob} onChange={(e) => set("torob", e.target.value)} /></label>
      {bad("torob") && <p className="small warn-text">{t("Paste a link to your shop on torob.com")}</p>}
      <label>📢 {t("Divar ad link")}<input className="input" dir="ltr" inputMode="url" maxLength={300} placeholder="https://divar.ir/v/…" value={v.divar} onChange={(e) => set("divar", e.target.value)} /></label>
      {bad("divar") && <p className="small warn-text">{t("Paste a link to your ad on divar.ir")}</p>}
    </fieldset>
  );
}

// ---------------------------------------------------------------- Takhfifan
/** A store with deals on Takhfifan, tapped on the map: what's off, each deal (its own page first), and the way there. */
/** A store's comments on Takhfifan (stars, text, the store's reply), ten more at a time. */
function DealReviewsPage({ id, page, last, onMore }: { id: number; page: number; last: boolean; onMore: () => void }) {
  const { data, error } = useLocal<{ reviews: DealReviewPage }>({ dealReviews: id, page });
  if (error) return <p className="small warn-text">{error}</p>;
  if (!data) return <p className="small muted">{t("Loading…")}</p>;
  const { reviews, count } = data.reviews;
  if (!reviews.length) return page === 0 ? <p className="small muted">{t("No reviews yet")}</p> : null;
  return (
    <>
      {reviews.map((r) => (
        <div className="review" key={r.id}>
          <div className="review-top">
            <b>{r.buyer ? t("A buyer") : t("A customer")}</b>
            {r.rate > 0 && (
              <span className="review-stars" role="img" aria-label={t("{n} of 5 stars", { n: fmtNum(r.rate) })}>
                {"★".repeat(r.rate)}
                <span className="dim">{"★".repeat(5 - r.rate)}</span>
              </span>
            )}
            <span className="grow" />
            {r.date && <span className="small muted">{fmtTime(r.date)}</span>}
          </div>
          {r.text && <p dir="auto">{r.text}</p>}
          {r.reply && <p className="small review-reply" dir="auto">↩️ {r.reply}</p>}
        </div>
      ))}
      {last && (page + 1) * 10 < count && (
        <Button className="btn small ghost block" onClick={onMore}>
          {t("More reviews")}
        </Button>
      )}
    </>
  );
}
function DealReviewsView({ id, total, avg }: { id: number; total: number; avg: number }) {
  const [pages, setPages] = useState(1);
  return (
    <div className="reviews">
      {avg > 0 && (
        <div className="star-bars">
          <div className="star-avg">
            <b>{fmtNum(avg)}</b>
            <span aria-hidden>{"★".repeat(Math.round(avg))}</span>
            {!!total && <span className="small muted">{t("{n} reviews", { n: fmtNum(total) })}</span>}
          </div>
        </div>
      )}
      {Array.from({ length: pages }, (_, i) => (
        <DealReviewsPage key={i} id={id} page={i} last={i === pages - 1} onMore={() => setPages((n) => Math.min(n + 1, 20))} />
      ))}
      <p className="small muted ext-source">{t("Reviews from Takhfifan customers")}</p>
    </div>
  );
}

/** A store's deals on Takhfifan: photo, what you pay, what it was, the % off, how many were sold; tap for the whole deal. */
function DealItems({ items, total, store, url }: { items: DealProduct[]; total: number; store: string; url: string }) {
  const ends = (iso: string) => (iso ? t("until {date}", { date: fmtTime(iso) }) : "");
  if (!items.length) return <p className="small muted">{t("Pay at the store with Takhfifan's app to get the cashback.")}</p>;
  return (
    <>
      <div className="ext-items compact">
        {items.map((i) => (
          <ProductRow
            key={i.id}
            product={{
              source: "takhfifan",
              title: i.name,
              photo: i.photo,
              url,
              price: toman(i.price),
              lines: [i.retail > i.price && t("instead of {n}", { n: toman(i.retail) }), i.off > 0 && t("{n}% off", { n: fmtNum(i.off) }), ends(i.ends), i.sold > 0 && t("{n} sold", { n: fmtNum(i.sold) }), store],
              desc: i.about,
              terms: i.terms,
            }}
          >
            {i.photo ? <img src={i.photo} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ext-ph">🏷️</span>}
            <div className="grow">
              <b dir="auto">{i.name}</b>
              {(i.ends || i.sold > 0) && <p className="small muted">{[ends(i.ends), i.sold > 0 ? t("{n} sold", { n: fmtNum(i.sold) }) : ""].filter(Boolean).join(" · ")}</p>}
            </div>
            <span className="price-tag deal-price">
              {i.off > 0 && <em>−{fmtNum(i.off)}%</em>}
              <b>{toman(i.price)}</b>
              {i.retail > i.price && <s>{fmtNum(i.retail)}</s>}
            </span>
          </ProductRow>
        ))}
      </div>
      {total > items.length && (
        <a className="btn small ghost block ext-link ext-takhfifan" href={url} target="_blank" rel="noopener noreferrer">
          {t("All {n} deals on Takhfifan", { n: fmtNum(total) })}
        </a>
      )}
    </>
  );
}

/** The Info tab: hours, address, phones (InfoView) and what only Takhfifan knows: how to pay for the cashback, the features, categories, site. */
function DealInfoView({ d, info }: { d: Deal; info: DealInfo }) {
  return (
    <>
      <InfoView at={d} store={{ name: d.name, lat: d.lat, lng: d.lng, city: info.city }} week={info.week} hours={info.hours} address={info.address} area={info.district} city={info.city} phones={info.phones} />
      <div className="store-info">
        {(info.cashback > 0 || info.payDiscount > 0) && (
          <section>
            <h4>💳 {t("Pay with Takhfifan")}</h4>
            {info.payDiscount > 0 && <div className="info-row">🏷️ {t("{n}% off when you pay there with the app", { n: fmtNum(info.payDiscount) })}</div>}
            {info.cashback > 0 && <div className="info-row">↩️ {t("Up to {n}% back", { n: fmtNum(info.cashback) })}</div>}
            {info.banks.map((b) => (
              <div className="info-row small muted" key={b.name} dir="auto">
                {b.name} · {t("{n}% back", { n: fmtNum(b.cashback) })}
              </div>
            ))}
          </section>
        )}
        {!!info.features.length && (
          <section>
            <h4>✨ {t("Features")}</h4>
            {info.features.map((f) => (
              <div className="info-row" key={f.label} dir="auto">
                <span className="muted">{f.label}:</span> {f.value}
              </div>
            ))}
          </section>
        )}
        {!!info.categories.length && <div className="info-row" dir="auto">🗂️ {info.categories.join(" › ")}</div>}
        {info.sold > 0 && <div className="info-row">🛍️ {t("{n} sold on Takhfifan", { n: fmtNum(info.sold) })}</div>}
        {info.website && (
          <a className="info-row link" href={info.website} target="_blank" rel="noopener noreferrer">
            🌐 <span dir="ltr">{info.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</span>
          </a>
        )}
      </div>
    </>
  );
}

/** A store with a deal or cashback on Takhfifan: photos, deals, comments and info in tabs; what the map lists shows at once, the rest loads. */
export function DealCard({ d, onClose }: { d: Deal; onClose: () => void }) {
  const { pos } = useGame();
  const dist = pos ? distanceM(pos, d) : Infinity;
  const { data, error, retry } = useLocal<{ info: DealInfo | null }>({ dealInfo: d.id });
  const info = data?.info ?? null;
  const photos = info?.photos.length ? info.photos : d.photos;
  const rating = info?.rating || d.rating, reviews = info?.reviews || d.reviews;
  const off = Math.max(d.off, info?.off ?? 0), cashback = Math.max(d.cashback, info?.cashback ?? 0);
  const sub = [d.category || info?.categories[0], info?.district || d.district, Number.isFinite(dist) ? formatDistance(dist) : ""].filter(Boolean).join(" · ");
  const items = info?.items.length ? info.items : (d.items as DealProduct[]);
  return (
    <Sheet title={d.name} onClose={onClose} tall>
      <StoreHead logo={info?.logo || photos[0]} emoji="🏷️" name={d.name} sub={sub} rating={rating || undefined} reviews={reviews || undefined} week={info?.week} at={d} />
      {photos.length > 0 && (
        <div className={`deal-gallery${photos.length === 1 ? " one" : ""}`}>
          {photos.map((u) => (
            <Pic key={u} src={u} />
          ))}
        </div>
      )}
      <div className="deal-head">
        {off > 0 && <span className="deal-big">{t("Up to {n}% off", { n: fmtNum(off) })}</span>}
        {cashback > 0 && <span className="deal-big back">{t("{n}% back when you pay there", { n: fmtNum(cashback) })}</span>}
      </div>
      <div className="store-actions">
        <a className="btn small ghost ext-link ext-takhfifan" href={d.url} target="_blank" rel="noopener noreferrer">
          🏷️ {t("Open on Takhfifan")}
        </a>
        {info && <CallButton store={{ name: d.name, lat: d.lat, lng: d.lng, city: info.city }} phones={info.phones} />}
        <GoButtons to={d} name={d.name} dist={dist} />
      </div>
      {error ? (
        <div className="ext-error">
          <p className="small warn-text">{error}</p>
          <Button className="btn small cyan" onClick={retry}>🔄 {t("Try again")}</Button>
        </div>
      ) : !data ? (
        <p className="small muted ext-loading">⏳ {t("Loading the store's deals…")}</p>
      ) : !info ? (
        <>
          <p className="small muted">{t("Takhfifan has no more about this store right now.")}</p>
          <DealItems items={items} total={items.length} store={d.name} url={d.url} />
        </>
      ) : (
        <StoreTabs
          tabs={[
            { key: "deals", label: `🏷️ ${items.length ? t("Deals ({n})", { n: fmtNum(info.itemsTotal || items.length) }) : t("Deals")}`, body: () => <DealItems items={items} total={info.itemsTotal} store={d.name} url={d.url} /> },
            { key: "reviews", label: `⭐ ${reviews ? t("Reviews ({n})", { n: fmtNum(reviews) }) : t("Reviews")}`, body: () => <DealReviewsView id={d.id} total={reviews} avg={rating} /> },
            { key: "info", label: `ℹ️ ${t("Info")}`, body: () => <DealInfoView d={d} info={info} /> },
          ]}
        />
      )}
      <p className="small muted ext-source">{t("From Takhfifan · updated every few hours")}</p>
    </Sheet>
  );
}

// ---------------------------------------------------------------- cinemas
/**
 * A cinema (from cinematicket.org): what's on today and tomorrow — each film with its poster
 * and its sessions (time, hall, price; VIP halls marked) — and where to buy the tickets.
 */
export function CinemaCard({ c, onClose }: { c: Cinema; onClose: () => void }) {
  const { pos } = useGame();
  const dist = pos ? distanceM(pos, c) : Infinity;
  const [state, setState] = useState<{ data: CinemaShows | null; error: string | null }>({ data: null, error: null });
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let live = true;
    api<CinemaShows>(`/api/cinema?id=${c.id}`)
      .then((data) => live && setState({ data, error: null }))
      .catch((e) => live && setState({ data: null, error: (e as Error).message }));
    return () => {
      live = false;
    };
  }, [c.id, tries]);
  const today = tehranDay(), tomorrow = tehranDay(new Date(Date.now() + 86_400_000));
  const sub = [t("Cinema"), Number.isFinite(dist) ? formatDistance(dist) : "", c.rates ? `⭐ ${fmtNum(c.rate)}` : ""].filter(Boolean).join(" · ");
  const dayTab = (day: string) => () => <FilmList films={state.data?.films ?? []} day={day} />;
  return (
    <Sheet title={`🎬 ${c.name}`} onClose={onClose} tall>
      <StoreHead logo={c.photo} emoji="🎬" name={c.name} sub={sub} at={c} />
      {c.address && <p className="small muted store-about" dir="auto">📍 {c.address}</p>}
      <div className="store-actions">
        <a className="btn small yellow ext-link" href={cinemaUrl(c.id)} target="_blank" rel="noopener noreferrer">🎟️ {t("Buy tickets on Cinematicket")}</a>
        <GoButtons to={c} name={c.name} dist={dist} />
      </div>
      {state.error ? (
        <div className="ext-error">
          <p className="small warn-text">{state.error}</p>
          <Button className="btn small cyan" onClick={() => (setState({ data: null, error: null }), setTries((n) => n + 1))}>🔄 {t("Try again")}</Button>
        </div>
      ) : state.data ? (
        <StoreTabs
          tabs={[
            { key: "today", label: `🎬 ${t("Today")}`, body: dayTab(today) },
            { key: "tomorrow", label: `📅 ${t("Tomorrow")}`, body: dayTab(tomorrow) },
          ]}
        />
      ) : (
        <p className="small muted ext-loading">⏳ {t("Looking up what's on…")}</p>
      )}
    </Sheet>
  );
}

/** The films showing on a day (Tehran's), each with its sessions. */
function FilmList({ films, day }: { films: Film[]; day: string }) {
  const on = films.map((f) => ({ ...f, showings: f.showings.filter((s) => tehranDay(new Date(s.at)) === day) })).filter((f) => f.showings.length);
  if (!on.length) return <p className="small muted">{t("No sessions on this day")}</p>;
  return (
    <div className="film-list">
      {on.map((f) => (
        <div key={f.id} className="film">
          <Pic src={f.poster} className="film-poster" />
          <div className="film-tx">
            <b dir="auto">{f.name}</b>
            <div className="film-times">
              {f.showings.map((s, i) => (
                <span key={i} className={`film-time ${s.vip ? "vip" : ""}`} title={s.hall}>
                  <b>{showTime(s.at)}</b>
                  <span>{s.hall}</span>
                  {s.toman > 0 && <span>{t("{n} toman", { n: fmtNum(s.toman) })}</span>}
                </span>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
