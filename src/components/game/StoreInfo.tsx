"use client";
// A real store's menu, catalog and prices from other sites (Snappfood; Torob, with the
// store's own Torob shop and its catalog when it has one) and its links, inside the map
// cards (real places, businesses, Market shops) and for Snappfood vendors on the map.
// Data: /api/local (server/localData.ts).
import { useEffect, useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { distanceM, formatDistance } from "@/lib/geo";
import { LINK_CHECKS, VENDOR_KINDS, type Menu, type StoreData, type TorobItem, type TorobShop, type Vendor } from "@/lib/localData";
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
const LINK_ICON = { snappfood: "🍽️", torob: "🏷️", divar: "📢", website: "🌐", phone: "📞" } as const;

/** Prices as the menu shows them: the price now, the old one struck through. */
function MenuPrice({ price, priceNow }: { price: number; priceNow: number }) {
  return (
    <span className="price-tag">
      <b>{toman(priceNow)}</b>
      {priceNow < price && <s>{fmtNum(price)}</s>}
    </span>
  );
}

/** A Snappfood menu (restaurant) or catalog (supermarket, bakery…), one section at a time. */
export function MenuView({ menu }: { menu: Menu }) {
  const [tab, setTab] = useState(0);
  const [q, setQ] = useState("");
  const kind = VENDOR_KINDS[menu.vendor.kind];
  const needle = q.trim().toLowerCase();
  const items = needle
    ? menu.sections.flatMap((s) => s.items).filter((i, n, all) => i.title.toLowerCase().includes(needle) && all.findIndex((x) => x.id === i.id) === n)
    : menu.sections[Math.min(tab, menu.sections.length - 1)]?.items ?? [];
  return (
    <div className="ext-menu">
      <div className="sec-head">
        <b>{menu.vendor.kind === "market" ? `🛒 ${t("Catalog")}` : `🍽️ ${t("Menu")}`}</b>
        <span className="grow" />
        <span className="small muted">{kind.emoji} {menu.vendor.rating > 0 ? `⭐ ${fmtNum(menu.vendor.rating)}` : ""} {menu.vendor.open ? t("Open") : t("Closed")}</span>
      </div>
      {menu.sections.reduce((n, s) => n + s.items.length, 0) > 12 && (
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search the menu")} aria-label={t("Search the menu")} />
      )}
      {!needle && menu.sections.length > 1 && (
        <div className="tabs" role="tablist">
          {menu.sections.map((s, i) => (
            <button key={`${s.title}${i}`} role="tab" aria-selected={i === tab} className={i === tab ? "on" : ""} onClick={() => setTab(i)} dir="auto">
              {s.title || t("More")}
            </button>
          ))}
        </div>
      )}
      <div className="ext-items">
        {items.map((i) => (
          <div key={i.id} className="ext-item">
            {i.photo ? <img src={i.photo} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ext-ph">{kind.emoji}</span>}
            <div className="grow">
              <b dir="auto">{i.title}</b>
              {i.about && <p className="small muted" dir="auto">{i.about}</p>}
              <MenuPrice price={i.price} priceNow={i.priceNow} />
            </div>
          </div>
        ))}
        {!items.length && <div className="empty">{t("Nothing matches")}</div>}
      </div>
      <p className="small muted ext-source">{t("From Snappfood · updated {when}", { when: fmtTime(menu.fetchedAt) })}</p>
    </div>
  );
}

function TorobList({ items }: { items: TorobItem[] }) {
  return (
    <div className="ext-items">
      {items.map((i) => (
        <a key={i.url} className="ext-item" href={i.url} target="_blank" rel="noopener noreferrer">
          {i.photo ? <img src={i.photo} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ext-ph">🏷️</span>}
          <div className="grow">
            <b dir="auto">{i.title}</b>
            {i.shop && <p className="small muted" dir="auto">{i.shop}</p>}
            {i.price > 0 ? <span className="price-tag"><b>{i.from ? t("from {n} toman", { n: fmtNum(i.price) }) : toman(i.price)}</b></span> : <span className="small muted">{t("Out of stock")}</span>}
          </div>
        </a>
      ))}
    </div>
  );
}

/**
 * Compare a product's price online (Torob), from inside any store. With the store's own
 * Torob shop: its catalog first, and the search looks in that shop unless told otherwise.
 */
function TorobSearch({ initial, shop }: { initial?: TorobItem[]; shop?: TorobShop | null }) {
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [everywhere, setEverywhere] = useState(!shop);
  const scope = shop && !everywhere ? shop.id : undefined;
  const res = useLocal<{ items: TorobItem[] }>(q ? { torob: q, shop: scope } : null);
  return (
    <div className="ext-torob">
      <div className="sec-head">
        {shop ? (
          <>
            {shop.logo && <img className="ext-shop-logo" src={shop.logo} alt="" referrerPolicy="no-referrer" />}
            <b dir="auto">🏷️ {t("{shop} on Torob", { shop: shop.name })}</b>
            <span className="grow" />
            {shop.count > 0 && <span className="small muted">{t("{n} products", { n: fmtNum(shop.count) })}</span>}
          </>
        ) : (
          <b>🏷️ {t("Prices on Torob")}</b>
        )}
      </div>
      {!!initial?.length && !q && <TorobList items={initial} />}
      {shop && (
        <div className="tabs" role="tablist">
          <button role="tab" aria-selected={!everywhere} className={everywhere ? "" : "on"} onClick={() => setEverywhere(false)}>{t("In this store")}</button>
          <button role="tab" aria-selected={everywhere} className={everywhere ? "on" : ""} onClick={() => setEverywhere(true)}>{t("All of Torob")}</button>
        </div>
      )}
      <form className="row" onSubmit={(e) => (e.preventDefault(), setQ(draft.trim()))}>
        <input className="input grow" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={scope ? t("Search this store's products") : t("Search a product's price")} aria-label={scope ? t("Search this store's products") : t("Search a product's price")} maxLength={60} />
        <Button className="btn cyan" disabled={draft.trim().length < 2}>🔎</Button>
      </form>
      {q && (res.error ? <p className="small warn-text">{res.error}</p> : !res.data ? <p className="small muted">{t("Loading…")}</p> : res.data.items.length ? <TorobList items={res.data.items} /> : <p className="small muted">{t("Nothing found on Torob")}</p>)}
    </div>
  );
}

/**
 * Everything other sites know about a store: its menu or catalog, its Torob listings,
 * price search, and links (Snappfood, Torob, Divar, website, phone).
 */
export function StoreExtras({ query }: { query: Record<string, string | number | undefined> }) {
  const { data, error } = useLocal<StoreData>(query);
  if (error) return <p className="small muted">{error}</p>;
  if (!data) return <p className="small muted ext-loading">⏳ {t("Looking up the menu and prices…")}</p>;
  return (
    <div className="ext-store">
      {!!data.links.length && (
        <div className="row wrap ext-links">
          {data.links.map((l) => (
            <a key={l.url} className={`btn small ghost ext-link ${l.kind}`} href={l.url} target={l.kind === "phone" ? undefined : "_blank"} rel="noopener noreferrer" dir="auto">
              {LINK_ICON[l.kind]} {l.label}
            </a>
          ))}
        </div>
      )}
      {data.menu ? <MenuView menu={data.menu} /> : !data.torobQuery && <p className="small muted">{t("No online menu found for this place yet.")}</p>}
      {!!data.torobQuery && <TorobSearch initial={data.torob} shop={data.torobShop} />}
    </div>
  );
}

/** A Snappfood vendor tapped on the map. */
export function VendorCard({ v, onClose }: { v: Vendor; onClose: () => void }) {
  const { pos, teleport, drive } = useGame();
  const kind = VENDOR_KINDS[v.kind];
  const dist = pos ? distanceM(pos, v) : Infinity;
  const { data, error } = useLocal<{ menu: Menu }>({ menu: v.code, lat: v.lat.toFixed(5), lng: v.lng.toFixed(5) });
  return (
    <Sheet title={`${kind.emoji} ${v.title}`} onClose={onClose} tall>
      <div className="place-card ext-vendor">
        <div className="place-head">
          {v.logo ? <img className="icon-tile place-ic" src={v.logo} alt="" referrerPolicy="no-referrer" /> : <div className="icon-tile place-ic">{kind.emoji}</div>}
          <div className="grow">
            <b dir="auto">{v.title}</b>
            <div className="small muted">{t(kind.label)}{Number.isFinite(dist) ? ` · ${formatDistance(dist)}` : ""}</div>
            {v.about && <div className="small muted" dir="auto">{v.about}</div>}
            {data?.menu.address && <div className="small" dir="auto">🏠 {data.menu.address}</div>}
          </div>
        </div>
      </div>
      <div className="row wrap">
        <a className="btn small ghost ext-link snappfood" href={v.url} target="_blank" rel="noopener noreferrer">🍽️ {t("Order on Snappfood")}</a>
        {teleport ? <Button className="btn small yellow" onClick={() => teleport(v)}><MoveIcon /> {t("Go there")}</Button> : dist > 150 && <Directions to={v} />}
        {drive && <Button className="btn small cyan" onClick={() => drive(v)}>🚗 {t("Drive there")}</Button>}
      </div>
      {error ? <p className="small warn-text">{error}</p> : data ? <MenuView menu={data.menu} /> : <p className="small muted ext-loading">⏳ {t("Looking up the menu and prices…")}</p>}
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
