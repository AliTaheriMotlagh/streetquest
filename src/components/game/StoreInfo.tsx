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
import { fmtNum, t } from "@/lib/i18n";
import { distanceM, formatDistance, type LatLng } from "@/lib/geo";
import {
  clockOf, dayClock, DIVAR_CAT_KEYS, DIVAR_CATS, LINK_CHECKS, openState, snappfoodMenuUrl, VENDOR_KINDS, WEEK_DAYS, weekFromOsm, zoneOf,
  type DivarArea, type DivarCat, type DivarPost, type Menu, type MenuItem, type Review, type ReviewPage, type StoreData, type TorobItem, type TorobPlace, type TorobPlaceInfo, type TorobShop, type TorobStock, type Vendor, type Week,
} from "@/lib/localData";
import { Button } from "@/components/Button";
import { api, fmtTime } from "./client";
import { Directions } from "./Play";
import { MoveIcon, Sheet, useGame } from "./ui";

/** GET /api/local with these params; null while loading, and the error if it failed. */
function useLocal<T>(params: Record<string, string | number | undefined> | null) {
  const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])).toString() : null;
  const [state, setState] = useState<{ qs: string | null; data: T | null; error: string | null }>({ qs: null, data: null, error: null });
  useEffect(() => {
    if (!qs) return;
    let live = true;
    api<T>(`/api/local?${qs}`)
      .then((data) => live && setState({ qs, data, error: null }))
      .catch((e) => live && setState({ qs, data: null, error: (e as Error).message }));
    return () => {
      live = false;
    };
  }, [qs]);
  return state.qs === qs ? state : { qs, data: null, error: null };
}

const toman = (n: number) => t("{n} toman", { n: fmtNum(n) });
const LINK_ICON = { snappfood: "🍽️", torob: "🏷️", divar: "📢", website: "🌐", phone: "📞", instagram: "📸" } as const;
/** "09:30" in the player's digits. */
const clock = (min: number) => clockOf(min).replace(/\d/g, (d) => fmtNum(Number(d)));
const spanText = ([a, b]: [number, number]) => `${clock(a)}–${clock(b > 1440 ? b - 1440 : b)}`;
const telOf = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

/** A picture that quietly goes away when it can't load (a dead link, a blocked CDN). */
function Pic({ src, className }: { src: string; className?: string }) {
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

type InfoProps = { at: LatLng; week?: Week | null; hours?: string; address?: string; area?: string; phone?: string; city?: string; minOrder?: number; deliveryFee?: number };
/** Hours, address, phone, delivery terms: whatever is known, else a line saying so. */
function InfoView({ at, week, hours, address, area, phone, city, minOrder, deliveryFee }: InfoProps) {
  const empty = !week && !hours && !address && !phone;
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
      {phone && (
        <a className="info-row link" href={telOf(phone)}>
          📞 <span dir="ltr">{phone}</span>
        </a>
      )}
      {!!minOrder && <div className="info-row">🧾 {t("Minimum order: {price}", { price: toman(minOrder) })}</div>}
      {deliveryFee != null && <div className="info-row">🛵 {deliveryFee ? t("Delivery: {price}", { price: toman(deliveryFee) }) : t("Free delivery")}</div>}
      {empty && <p className="small muted">{t("No hours, address or phone known for this store yet.")}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- tabs
type Tab = { key: string; label: string; body: () => React.ReactNode };
/** The card's sections, one at a time; the bar sticks to the top of the sheet while scrolling. */
function StoreTabs({ tabs }: { tabs: Tab[] }) {
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

// ---------------------------------------------------------------- Torob
/**
 * A store's products on Torob. A row whose price is Torob's lowest anywhere (`from`: a
 * shop catalog lists the best price, not necessarily this store's) says so.
 */
function TorobList({ items }: { items: TorobItem[] }) {
  return (
    <div className="ext-items compact">
      {items.map((i) => (
        <a key={i.url} className="ext-item" href={i.url} target="_blank" rel="noopener noreferrer">
          {i.photo ? <img src={i.photo} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ext-ph">🏷️</span>}
          <div className="grow">
            <b dir="auto">{i.title}</b>
            {i.from && <p className="small muted">{t("Lowest price on Torob")}</p>}
          </div>
          {i.price > 0 ? <span className="price-tag"><b>{i.from ? t("from {n} toman", { n: fmtNum(i.price) }) : toman(i.price)}</b></span> : <span className="small muted">{t("Out of stock")}</span>}
        </a>
      ))}
    </div>
  );
}

/** What a walk-in store was seen selling on Torob's map of sellers, at its own prices. */
function StockList({ items }: { items: TorobStock[] }) {
  return (
    <div className="ext-items compact">
      {items.map((i) => (
        <a key={i.url} className="ext-item" href={i.url} target="_blank" rel="noopener noreferrer">
          {i.photo ? <img src={i.photo} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ext-ph">🏷️</span>}
          <div className="grow">
            <b dir="auto">{i.title}</b>
            {(i.note || i.when) && <p className="small muted" dir="auto">{[i.note, i.when && t("price changed {when}", { when: i.when })].filter(Boolean).join(" · ")}</p>}
          </div>
          {i.price > 0 ? <span className="price-tag"><b>{toman(i.price)}</b></span> : <span className="small muted">{t("Ask in the store")}</span>}
        </a>
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
export function StoreExtras({ query, at }: { query: Record<string, string | number | undefined>; at?: LatLng }) {
  const { data, error } = useLocal<StoreData>(query);
  if (error) return <p className="small muted">{error}</p>;
  if (!data) return <p className="small muted ext-loading">⏳ {t("Looking up the menu and prices…")}</p>;
  const a = data.about;
  const where = at ?? (data.menu ? data.menu.vendor : { lat: 0, lng: 0 });
  const week = a.week ?? weekFromOsm(a.hours);
  const tabs: Tab[] = [];
  if (data.menu) tabs.push({ key: "menu", label: data.menu.vendor.kind === "market" ? `🛒 ${t("Catalog")}` : `🍽️ ${t("Menu")}`, body: () => <MenuView menu={data.menu!} /> });
  // Torob only for a store that's on it: its own shop, or listings only it sells.
  const onTorob = !!data.torobShop || data.torob.length > 0;
  if (onTorob) tabs.push({ key: "torob", label: `🏷️ ${t("Torob")}`, body: () => <TorobSearch initial={data.torob} shop={data.torobShop} /> });
  if (data.menu) tabs.push({ key: "reviews", label: `⭐ ${data.menu.reviews ? t("Reviews ({n})", { n: fmtNum(data.menu.reviews) }) : t("Reviews")}`, body: () => <ReviewsView code={data.menu!.vendor.code} total={data.menu!.reviews} stars={data.menu!.stars} /> });
  tabs.push({ key: "info", label: `ℹ️ ${t("Info")}`, body: () => <InfoView at={where} week={week} hours={a.hours} address={a.address} area={data.menu?.area} phone={a.phone} minOrder={data.menu?.minOrder} deliveryFee={data.menu?.deliveryFee} /> });
  return (
    <div className="ext-store">
      {(a.photo || a.logo) && (
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
      {!!data.links.length && (
        <div className="store-actions ext-links">
          {data.links.map((l) => (
            <a key={l.url} className={`btn small ghost ext-link ext-${l.kind}`} href={l.url} target={l.kind === "phone" ? undefined : "_blank"} rel="noopener noreferrer" dir="auto">
              {LINK_ICON[l.kind]} {l.label}
            </a>
          ))}
        </div>
      )}
      {!data.menu && !onTorob && <p className="small muted">{t("No online menu found for this place yet.")}</p>}
      <StoreTabs tabs={tabs} />
    </div>
  );
}

/** The head every store card starts with: logo, name, what and how far, rating and open now. */
function StoreHead({ logo, emoji, name, sub, rating, reviews, week, at }: { logo?: string; emoji: string; name: string; sub: string; rating?: number; reviews?: number; week?: Week | null; at: LatLng }) {
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
function GoButtons({ to, name, dist }: { to: LatLng; name: string; dist: number }) {
  const { teleport, drive } = useGame();
  return (
    <>
      {teleport ? (
        <Button className="btn small yellow" onClick={() => teleport(to)}>
          <MoveIcon /> {t("Go there")}
        </Button>
      ) : (
        dist > 150 && (
          <>
            <RouteButton to={to} name={name} />
            <Directions to={to} />
          </>
        )
      )}
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
  const { data, error } = useLocal<{ menu: Menu }>({ menu: v.code, lat: v.lat.toFixed(5), lng: v.lng.toFixed(5) });
  const menu = data?.menu;
  const sub = [t(kind.label), Number.isFinite(dist) ? formatDistance(dist) : "", menu?.area ?? ""].filter(Boolean).join(" · ");
  return (
    <Sheet title={`${kind.emoji} ${v.title}`} onClose={onClose} tall>
      <StoreHead logo={v.logo} emoji={kind.emoji} name={v.title} sub={sub} rating={v.rating} reviews={menu?.reviews} week={menu?.week} at={v} />
      {v.about && <p className="small muted store-about" dir="auto">{v.about}</p>}
      {menu?.cover && <div className="ext-cover"><Pic src={menu.cover} className="ext-cover-img" /></div>}
      <div className="store-actions">
        <a className="btn small ghost ext-link ext-snappfood" href={snappfoodMenuUrl(v.code)} target="_blank" rel="noopener noreferrer">🍽️ {t("Order on Snappfood")}</a>
        {menu?.phone && <a className="btn small ghost ext-link ext-phone" href={telOf(menu.phone)}>📞 {t("Call")}</a>}
        <GoButtons to={v} name={v.title} dist={dist} />
      </div>
      {error ? (
        <p className="small warn-text">{error}</p>
      ) : menu ? (
        <StoreTabs
          tabs={[
            { key: "menu", label: v.kind === "market" ? `🛒 ${t("Catalog")}` : `🍽️ ${t("Menu")}`, body: () => <MenuView menu={menu} /> },
            { key: "reviews", label: `⭐ ${menu.reviews ? t("Reviews ({n})", { n: fmtNum(menu.reviews) }) : t("Reviews")}`, body: () => <ReviewsView code={v.code} total={menu.reviews} stars={menu.stars} /> },
            { key: "info", label: `ℹ️ ${t("Info")}`, body: () => <InfoView at={v} week={menu.week} address={menu.address} area={menu.area} phone={menu.phone} minOrder={menu.minOrder} deliveryFee={menu.deliveryFee} /> },
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
        {info?.phone && <a className="btn small ghost ext-link ext-phone" href={telOf(info.phone)}>📞 {t("Call")}</a>}
        <GoButtons to={p} name={p.name} dist={dist} />
      </div>
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
            { key: "info", label: `ℹ️ ${t("Info")}`, body: () => <InfoView at={p} week={p.week} address={info?.address || p.address} city={p.city} phone={info?.phone} /> },
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
        <a key={p.token} className="ext-item" href={p.url} target="_blank" rel="noopener noreferrer">
          {p.photo ? <img src={p.photo} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ext-ph">📢</span>}
          <div className="grow">
            <b dir="auto">{p.title}</b>
            <p className="small muted" dir="auto">{[p.note, p.when].filter(Boolean).join(" · ")}</p>
          </div>
          {p.price && <span className="price-tag" dir="auto"><b>{p.price}</b></span>}
        </a>
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
