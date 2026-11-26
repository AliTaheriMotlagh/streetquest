"use client";
// The Market: players' shops at real places. Browse shops and deals around you, open
// a shop to see its window and shelves, buy (coins wait in escrow until pickup), and
// run your own shop: products with photos, prices, discounts and a shop window, plus
// the orders you hand over with the buyer's pickup code. A product is any kind the store sites
// carry (lib/shopKinds.ts: an item, food, a ticket, an ad, a deal, a service) with that kind's
// details; priced in coins (bought here) or toman (paid to the seller directly: call, their
// payment link, or a message in the game).
import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import { fmtNum, t, toAsciiDigits } from "@/lib/i18n";
import { formatDistance } from "@/lib/geo";
import { S } from "@/lib/settings";
import { categoryOf, daysLeft, MAX_DISCOUNT, priceNow, SHOP_CATEGORIES, SHOP_EMOJIS, SHOP_LIMITS, shopFee, SHOP_WARN_MS } from "@/lib/shops";
import { askConfirm, askText } from "@/components/Dialogs";
import { REASON_LABEL, REPORT_REASONS, type ReportReason } from "@/lib/stores/moderation";
import { Button } from "@/components/Button";
import { AdSlot } from "@/components/AdSlot";
import { useUrlParam } from "@/components/useUrlParam";
import { oneOf, text } from "@/lib/urlState";
import { Advertise } from "./Advertise";
import { api, fmtTime, type ShopCard, type ShopDeal, type ShopOrder, type ShopProduct, type ShopView } from "./client";
import { fmtCountdown } from "./Lottery";
import { Directions } from "./Play";
import { resizePhoto } from "./photo";
import { sfx } from "./sfx";
import { MoveIcon, revealInSheet, Sheet, useGame } from "./ui";
import { OwnerLinkFields, StoreExtras } from "./StoreInfo";
import { ScanCard } from "./ScanCard";
import { ShareButton } from "@/components/ShareButton";
import { cleanPayLink, cleanPhone, contactOf, detailRows, KINDS, kindLine, priceProblem, PRODUCT_KIND_KEYS, shopRoom, type Currency, type FieldDef, type Pair, type ProductKind } from "@/lib/shopKinds";

const img = (id: string) => `/shop-img/${id}`;
/** A shop's public page (app/s/[id]): the link to share. */
const shopUrl = (id: string) => `${typeof location === "undefined" ? "" : location.origin}/s/${id}`;

type View =
  | { v: "browse" }
  | { v: "shop"; id: string }
  | { v: "product"; shopId: string; productId: string }
  | { v: "mine" }
  | { v: "setup" }
  | { v: "edit"; productId: string | null }
  | { v: "orders"; side?: "buying" | "selling"; highlight?: string };
type Root = "browse" | "mine" | "orders";
const rootOf = (v: View): Root => (v.v === "mine" || v.v === "setup" || v.v === "edit" ? "mine" : v.v === "orders" ? "orders" : "browse");

/** Loads `path` (null = don't), with a reload and a local setter for optimistic edits. */
function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const ticket = useRef(0);
  const load = useCallback(() => {
    if (!path) return Promise.resolve();
    const n = ++ticket.current;
    return api<T>(path)
      .then((d) => {
        if (n === ticket.current) (setData(d), setError(null));
      })
      .catch((e) => n === ticket.current && setError((e as Error).message));
  }, [path]);
  useEffect(() => {
    load();
  }, [load]);
  return { data, error, reload: load, setData };
}

/** Ticks every second while mounted (deal countdowns). */
function useNow(on = true) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!on) return;
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, [on]);
  return now;
}

// ---------------------------------------------------------------- the panel
export function MarketPanel({ onClose, peek, focus, onFocused }: { onClose: () => void; peek: boolean; focus?: string | null; onFocused?: () => void }) {
  const { me, setPanel } = useGame();
  const [stack, setStack] = useState<View[]>(() => [focus ? { v: "shop", id: focus } : { v: "browse" }]);
  const view = stack[stack.length - 1];
  const go = useCallback((v: View) => setStack((s) => [...s, v]), []);
  const back = useCallback(() => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)), []);
  const root = (r: Root) => setStack([r === "browse" ? { v: "browse" } : r === "mine" ? { v: "mine" } : { v: "orders" }]);

  // Tapped a shop on the map while the panel was already open.
  useEffect(() => {
    if (!focus) return;
    setStack((s) => (s[s.length - 1].v === "shop" && (s[s.length - 1] as { id: string }).id === focus ? s : [{ v: "browse" }, { v: "shop", id: focus }]));
    onFocused?.();
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = me.shop?.pending ?? 0;
  const closing = !!me.shop && me.shop.expiresAt - Date.now() < SHOP_WARN_MS;
  const title =
    view.v === "browse" ? t("Market") : view.v === "mine" ? t("My shop") : view.v === "setup" ? (me.shop ? t("Shop details") : t("Open your shop")) : view.v === "edit" ? (view.productId ? t("Edit product") : t("New product")) : view.v === "orders" ? t("Orders") : view.v === "shop" ? t("Shop") : t("Product");

  return (
    <Sheet
      title={title}
      onClose={onClose}
      peek={peek}
      help="market"
      actions={stack.length > 1 ? <button className="close back-btn" onClick={back} aria-label={t("Back")}>‹</button> : undefined}
    >
      <div className="seg seg3" role="tablist">
        <button role="tab" aria-selected={rootOf(view) === "browse"} className={rootOf(view) === "browse" ? "on" : ""} onClick={() => root("browse")}>
          🛍️ {t("Shops")}
        </button>
        <button role="tab" aria-selected={rootOf(view) === "mine"} className={rootOf(view) === "mine" ? "on" : ""} onClick={() => root("mine")}>
          🏪 {t("My shop")} {closing && <span className="seg-n">!</span>}
        </button>
        <button role="tab" aria-selected={rootOf(view) === "orders"} className={rootOf(view) === "orders" ? "on" : ""} onClick={() => root("orders")}>
          📦 {t("Orders")} {pending > 0 && <span className="seg-n">{fmtNum(pending)}</span>}
        </button>
      </div>
      {view.v === "browse" && (
        <button className="biz-banner" onClick={() => setPanel("biz")}>
          <span className="ic">🏪</span>
          <span className="grow"><b>{t("Own a real store?")}</b><span className="small">{t("Put it on the game map and bring players through your door.")}</span></span>
          <span aria-hidden>›</span>
        </button>
      )}
      {view.v === "browse" && <Browse onShop={(id) => go({ v: "shop", id })} onProduct={(shopId, productId) => go({ v: "product", shopId, productId })} onOpenMine={() => root("mine")} />}
      {view.v === "shop" && <ShopPage key={view.id} id={view.id} onProduct={(productId) => go({ v: "product", shopId: view.id, productId })} onManage={() => root("mine")} />}
      {view.v === "product" && (
        <ProductPage
          key={view.productId}
          shopId={view.shopId}
          productId={view.productId}
          onShop={() => (stack.length > 1 && stack[stack.length - 2].v === "shop" ? back() : go({ v: "shop", id: view.shopId }))}
          onBought={(orderId) => setStack([{ v: "orders", side: "buying", highlight: orderId }])}
          onEdit={() => setStack([{ v: "mine" }, { v: "edit", productId: view.productId }])}
        />
      )}
      {view.v === "mine" && <MyShop go={go} />}
      {view.v === "setup" && <ShopForm onDone={back} />}
      {view.v === "edit" && <ProductForm productId={view.productId} onDone={back} />}
      {view.v === "orders" && <Orders initialSide={view.side ?? (pending > 0 ? "selling" : "buying")} highlight={view.highlight} onShop={(id) => go({ v: "shop", id })} />}
    </Sheet>
  );
}

// ---------------------------------------------------------------- small pieces
function Photo({ id, alt, fallback, className }: { id: string | null | undefined; alt: string; fallback: string; className?: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className={`shop-photo ${className ?? ""}`}>
      {id && !broken ? <img src={img(id)} alt={alt} loading="lazy" decoding="async" onError={() => setBroken(true)} /> : <span aria-hidden>{fallback}</span>}
    </div>
  );
}

/** A price in its currency: "120 🪙", "85,000 toman", or "Ask the seller" for a toman price of 0. */
const money = (n: number, currency: Currency = "coins") => (currency === "toman" ? (n ? t("{n} toman", { n: fmtNum(n) }) : t("Ask the seller")) : `${fmtNum(n)} 🪙`);
/** Kind-specific words and numbers in the player's language (lib/shopKinds.ts). */
const kindFmt = { num: (n: number) => fmtNum(n), date: (ms: number) => fmtTime(ms) };

/** Price with the discount shown the way shops do: −20%, old price struck through. */
function Price({ price, priceNow: now, deal, big, currency }: { price: number; priceNow: number; deal: number; big?: boolean; currency?: Currency }) {
  return (
    <span className={`price-tag ${big ? "big" : ""}`}>
      <b>{money(now, currency)}</b>
      {deal > 0 && price > 0 && (
        <>
          <s>{fmtNum(price)}</s>
          <span className="deal-pill">{t("−{n}%", { n: deal })}</span>
        </>
      )}
    </span>
  );
}

type TileProduct = { id: string; title: string; price: number; priceNow: number; deal: number; photo?: string | null; photos?: string[]; stock?: number; active?: boolean; featured?: boolean; kind?: ProductKind; details?: unknown; currency?: Currency; over?: boolean };
function ProductTile({ p, emoji, onOpen }: { p: TileProduct; emoji: string; onOpen: () => void }) {
  const soldOut = p.stock === 0;
  const kind = p.kind ?? "item";
  const line = kindLine(kind, p.details, kindFmt);
  return (
    <button className={`prod-tile ${soldOut || p.over ? "sold-out" : ""} ${p.active === false ? "hidden-prod" : ""}`} onClick={onOpen}>
      <Photo id={p.photo ?? p.photos?.[0]} alt={p.title} fallback={kind === "item" ? emoji : KINDS[kind].emoji} className="square" />
      {p.deal > 0 && !soldOut && !p.over && <span className="ribbon">{t("−{n}%", { n: p.deal })}</span>}
      {p.over ? <span className="ribbon gray">{t("Over")}</span> : soldOut && <span className="ribbon gray">{t("Sold out")}</span>}
      {p.active === false && <span className="ribbon gray">{t("Hidden")}</span>}
      <span className="prod-info">
        <span className="prod-title" dir="auto">{kind !== "item" && `${KINDS[kind].emoji} `}{p.title}</span>
        {line && <span className="prod-line small muted ellipsis" dir="auto">{line}</span>}
        <Price price={p.price} priceNow={p.priceNow} deal={p.deal} currency={p.currency} />
      </span>
    </button>
  );
}

function ShopBanner({ shop }: { shop: Pick<ShopView, "coverId" | "emoji" | "name" | "category"> }) {
  return (
    <div className="shop-cover">
      {shop.coverId ? <img src={img(shop.coverId)} alt="" decoding="async" /> : <span className="shop-cover-art" aria-hidden>{categoryOf(shop.category).emoji}</span>}
      <span className="shop-logo" aria-hidden>{shop.emoji}</span>
    </div>
  );
}

/** "Go there" for the shop: walk with directions, or travel in test mode / from home. */
function GoToShop({ to }: { to: { lat: number; lng: number } }) {
  const { teleport } = useGame();
  return (
    <>
      {teleport && (
        <Button className="btn yellow small" onClick={() => teleport(to)}>
          <MoveIcon /> {t("Go there")}
        </Button>
      )}
      <Directions to={to} className="btn cyan small" label={`🧭 ${t("Directions")}`} />
    </>
  );
}

// ---------------------------------------------------------------- browse
function Browse({ onShop, onProduct, onOpenMine }: { onShop: (id: string) => void; onProduct: (shopId: string, productId: string) => void; onOpenMine: () => void }) {
  const { pos, me } = useGame();
  // The search and category live in the address (lib/urlState.ts): shareable, kept on reload.
  const [q, setQ] = useUrlParam("mq", "", text(60));
  const [query, setQuery] = useState(q.trim());
  const [cat, setCat] = useUrlParam<string>("mcat", "", oneOf(["", ...SHOP_CATEGORIES.map((c) => c.key)], ""));
  // Search as you type, but not on every key press.
  useEffect(() => {
    const i = setTimeout(() => setQuery(q.trim()), 350);
    return () => clearTimeout(i);
  }, [q]);
  // Round the position so walking around doesn't refetch the list every few metres.
  const at = pos ? `lat=${pos.lat.toFixed(3)}&lng=${pos.lng.toFixed(3)}` : "";
  const path = at || query ? `/api/shops?${at}${query ? `&q=${encodeURIComponent(query)}` : ""}${cat ? `&cat=${cat}` : ""}` : null;
  const { data, error } = useApi<{ shops: ShopCard[]; deals: ShopDeal[] }>(path);

  return (
    <>
      <div className="search-box">
        <span aria-hidden>🔍</span>
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search shops and products…")} maxLength={60} enterKeyHint="search" aria-label={t("Search shops and products…")} />
      </div>
      <div className="tabs" role="tablist" aria-label={t("Categories")}>
        <button className={cat === "" ? "on" : ""} onClick={() => setCat("")}>{t("All")}</button>
        {SHOP_CATEGORIES.map((c) => (
          <button key={c.key} className={cat === c.key ? "on" : ""} onClick={() => setCat(cat === c.key ? "" : c.key)}>
            {c.emoji} {t(c.label)}
          </button>
        ))}
      </div>

      {!path && <div className="empty">{t("Waiting for your location to find shops around you…")}</div>}
      {error && !data && <div className="empty">{error}</div>}
      {path && !data && !error && <div className="empty">{t("Loading…")}</div>}

      {!!data?.deals.length && !query && (
        <>
          <div className="sec-head"><b>🔥 {t("Hot deals nearby")}</b></div>
          <div className="deal-row">
            {data.deals.map((d) => (
              <button key={d.id} className="deal-card" onClick={() => onProduct(d.shopId, d.id)}>
                <Photo id={d.photo} alt={d.title} fallback={d.shopEmoji} className="square" />
                <span className="ribbon">{t("−{n}%", { n: d.deal })}</span>
                <span className="prod-info">
                  <span className="prod-title" dir="auto">{d.title}</span>
                  <Price price={d.price} priceNow={d.priceNow} deal={0} currency={d.currency} />
                  <span className="small muted ellipsis" dir="auto">{d.shopEmoji} {d.shopName}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {data && (
        <div className="sec-head">
          <b>{query ? t("Results for “{q}”", { q: query }) : t("Shops around you")}</b>
        </div>
      )}
      {data?.shops.map((s, i) => (
        <Fragment key={s.id}>
          <ShopTile s={s} onOpen={() => onShop(s.id)} onProduct={(id) => onProduct(s.id, id)} />
          {/* One ad after the third shop (or the last, in a short list); lazy, never in the 3D city. */}
          {i === Math.min(2, data.shops.length - 1) && <AdSlot />}
        </Fragment>
      ))}
      {data && !data.shops.length && (
        <div className="empty">
          <div style={{ fontSize: 40 }}>🏪</div>
          {query ? t("Nothing matches that search.") : t("No shops around here yet.")}
          {!me.shop && (
            <div style={{ marginTop: 12 }}>
              <Button className="btn yellow small" onClick={onOpenMine}>{t("Open the first one")}</Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ShopTile({ s, onOpen, onProduct }: { s: ShopCard; onOpen: () => void; onProduct: (id: string) => void }) {
  return (
    <div className="shop-tile">
      <button className="shop-tile-head" onClick={onOpen}>
        <ShopBanner shop={s} />
        {s.deal > 0 && <span className="ribbon big">{t("Up to {n}% off", { n: s.deal })}</span>}
        <span className="shop-tile-info">
          <b className="ellipsis" dir="auto">{s.name}</b>
          {s.tagline && <span className="small muted ellipsis" dir="auto">{s.tagline}</span>}
          <span className="small muted">
            {s.distanceM != null && `📍 ${formatDistance(s.distanceM)} · `}
            {t("{n, plural, one {# product} other {# products}}", { n: s.inStock })}
            {s.sales > 0 && ` · ${t("{n} sold", { n: s.sales })}`}
          </span>
        </span>
      </button>
      {!!s.showcase.length && (
        <div className="mini-window">
          {s.showcase.map((p) => (
            <button key={p.id} className="mini-prod" onClick={() => onProduct(p.id)} aria-label={p.title}>
              <Photo id={p.photo} alt={p.title} fallback={s.emoji} className="square" />
              <span className="mini-price">{money(p.priceNow, p.currency)}</span>
              {p.deal > 0 && <span className="mini-deal">{t("−{n}%", { n: p.deal })}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- one shop
function ShopPage({ id, onProduct, onManage }: { id: string; onProduct: (productId: string) => void; onManage: () => void }) {
  const { pos } = useGame();
  const [onSale, setOnSale] = useState(false);
  const [sort, setSort] = useState<"new" | "cheap" | "deal">("new");
  const at = pos ? `?lat=${pos.lat.toFixed(4)}&lng=${pos.lng.toFixed(4)}` : "";
  const { data, error } = useApi<{ shop: ShopView }>(`/api/shops/${id}${at}`);
  const [aboutOpen, setAboutOpen] = useState(false);
  if (error && !data) return <div className="empty">{error}</div>;
  if (!data) return <div className="empty">{t("Loading…")}</div>;
  const s = data.shop;
  const window = s.products.filter((p) => p.featured && p.active && !p.over);
  let shelf = s.products.filter((p) => (s.mine || p.active) && (!onSale || p.deal > 0));
  shelf = [...shelf].sort((a, b) => (sort === "cheap" ? a.priceNow - b.priceNow : sort === "deal" ? b.deal - a.deal : 0) || Number(b.stock > 0) - Number(a.stock > 0));
  const cat = categoryOf(s.category);

  return (
    <div className="shop-page">
      <ShopBanner shop={s} />
      <div className="shop-head">
        <h3 dir="auto">{s.name}</h3>
        {s.tagline && <p className="muted small" dir="auto">{s.tagline}</p>}
        <div className="row wrap small">
          <span className={`tag ${s.live ? "tag-open" : "tag-closed"}`}>{s.live ? t("Open") : s.open ? t("Closed — time ran out") : t("Paused by the owner")}</span>
          <span className="muted">{cat.emoji} {t(cat.label)}</span>
          {s.distanceM != null && <span className="muted">· 📍 {formatDistance(s.distanceM)}</span>}
          {s.sales > 0 && <span className="muted">· {t("{n} sold", { n: s.sales })}</span>}
        </div>
        <div className="row small muted" style={{ marginTop: 4 }}>
          <span>{s.owner.avatar} {t("Run by {name}", { name: s.owner.username })}</span>
        </div>
        {s.address && <p className="small" dir="auto" style={{ margin: "8px 0 0" }}>🏠 {s.address}</p>}
        {s.about && (
          <p className={`small shop-about ${aboutOpen ? "open" : ""}`} dir="auto" onClick={() => setAboutOpen(!aboutOpen)}>
            {s.about}
          </p>
        )}
        <div className="row wrap" style={{ marginTop: 10 }}>
          {s.mine ? <Button className="btn yellow small" onClick={onManage}>🛠️ {t("Manage my shop")}</Button> : <GoToShop to={s} />}
          <ShareButton title={s.name} text={s.tagline || undefined} url={shopUrl(s.id)} className="btn cyan small" />
        </div>
        <StoreExtras query={{ store: "shop", id: s.id }} />
      </div>

      {!!window.length && (
        <>
          <div className="sec-head"><b>🪟 {t("Shop window")}</b></div>
          <div className="showcase-row">
            {window.map((p) => (
              <button key={p.id} className="showcase-card" onClick={() => onProduct(p.id)}>
                <Photo id={p.photos[0]} alt={p.title} fallback={s.emoji} className="wide" />
                {p.deal > 0 && p.stock > 0 && <span className="ribbon big">{t("−{n}%", { n: p.deal })}</span>}
                {p.stock === 0 && <span className="ribbon gray">{t("Sold out")}</span>}
                <span className="prod-info">
                  <span className="prod-title" dir="auto">{p.title}</span>
                  <Price price={p.price} priceNow={p.priceNow} deal={p.deal} currency={p.currency} />
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <div className="sec-head">
        <b>🛒 {t("All products")}</b>
        <span className="grow" />
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="mini-select" aria-label={t("Sort")}>
          <option value="new">{t("Newest")}</option>
          <option value="cheap">{t("Cheapest")}</option>
          <option value="deal">{t("Biggest discount")}</option>
        </select>
      </div>
      {s.products.some((p) => p.deal > 0) && (
        <div className="tabs">
          <button className={!onSale ? "on" : ""} onClick={() => setOnSale(false)}>{t("Everything")}</button>
          <button className={onSale ? "on" : ""} onClick={() => setOnSale(true)}>🔥 {t("On sale")}</button>
        </div>
      )}
      {shelf.length ? (
        <div className="prod-grid">
          {shelf.map((p) => (
            <ProductTile key={p.id} p={p} emoji={s.emoji} onOpen={() => onProduct(p.id)} />
          ))}
        </div>
      ) : (
        <div className="empty">{s.mine ? t("Your shelves are empty — add a product in My shop.") : t("Nothing on the shelves right now.")}</div>
      )}
      {!s.mine && <ReportButton shopId={s.id} />}
    </div>
  );
}

// ---------------------------------------------------------------- one product
function ProductPage({ shopId, productId, onShop, onBought, onEdit }: { shopId: string; productId: string; onShop: () => void; onBought: (orderId: string) => void; onEdit: () => void }) {
  const { me, act, pos, openChat } = useGame();
  const at = pos ? `?lat=${pos.lat.toFixed(4)}&lng=${pos.lng.toFixed(4)}` : "";
  const { data, error, reload } = useApi<{ shop: ShopView }>(`/api/shops/${shopId}${at}`);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [slide, setSlide] = useState(0);
  const gallery = useRef<HTMLDivElement>(null);
  const p = data?.shop.products.find((x) => x.id === productId);
  const now = useNow(!!p?.dealEnds);
  if (error && !data) return <div className="empty">{error}</div>;
  if (!data) return <div className="empty">{t("Loading…")}</div>;
  const s = data.shop;
  if (!p) return <div className="empty">{t("This product isn't for sale any more")}</div>;

  // The price as it will be when the order lands (a discount may end any second).
  const unit = priceNow(p, now);
  const dealOn = unit < p.price;
  const max = Math.min(p.stock, SHOP_LIMITS.qty);
  const n = Math.max(1, Math.min(qty, max));
  const total = unit * n;
  const toman = p.currency === "toman";
  const kind = KINDS[p.kind];
  const rows = detailRows(p.kind, p.details, kindFmt);
  const why = !s.live ? t("This shop is closed right now") : p.over ? t("That's already over") : p.stock === 0 ? t("Sold out") : !toman && total > me.coins ? t("Not enough coins — you have {n}", { n: me.coins }) : null;
  const contact = contactOf(p.kind, p.details, s);

  const onScroll = () => {
    const g = gallery.current;
    if (g) setSlide(Math.round(Math.abs(g.scrollLeft) / g.clientWidth));
  };
  const buy = () =>
    askConfirm(t("Buy {qty}× {title}?", { qty: n, title: p.title }), {
      body: t("{n} coins are held safely until you pick it up at {shop}. You'll get a pickup code to show the seller.", { n: total, shop: s.name }),
      ok: t("Buy for {n} 🪙", { n: total }),
    }).then(async (ok) => {
      if (!ok) return;
      let orderId = "";
      const done = await act(async () => {
        const r = await api<{ message: string; order: ShopOrder }>("/api/shops/orders", { body: { action: "buy", productId: p.id, qty: n, note, price: unit } });
        orderId = r.order.id;
        return r;
      });
      if (done) {
        sfx("coin");
        onBought(orderId);
      } else reload();
    });

  return (
    <div className="product-page">
      <div className="gallery-wrap">
        <div className="gallery" ref={gallery} onScroll={onScroll}>
          {p.photos.length ? p.photos.map((id) => <img key={id} src={img(id)} alt={p.title} decoding="async" />) : <div className="gallery-empty">{s.emoji}</div>}
        </div>
        {dealOn && <span className="ribbon big">{t("−{n}%", { n: p.deal })}</span>}
        {p.photos.length > 1 && (
          <div className="gallery-dots" aria-hidden>
            {p.photos.map((id, i) => <i key={id} className={i === slide ? "on" : ""} />)}
          </div>
        )}
      </div>

      <p className="small muted product-kind">{kind.emoji} {t(kind.label)}{p.details.negotiable === true && ` · ${t("Price negotiable")}`}</p>
      <h3 className="product-title" dir="auto">{p.title}</h3>
      <div className="row wrap" style={{ alignItems: "baseline" }}>
        <Price price={p.price} priceNow={unit} deal={dealOn ? p.deal : 0} big currency={p.currency} />
      </div>
      {dealOn && p.dealEnds && <p className="small deal-ends">⏳ {t("Discount ends in {time}", { time: fmtCountdown(p.dealEnds - now) })}</p>}
      <p className="small muted" style={{ margin: "6px 0" }}>
        {p.over ? t("That's already over") : p.stock === 0 ? t("Sold out") : p.kind === "item" ? (p.stock <= 3 ? t("Only {n} left!", { n: p.stock }) : t("{n} in stock", { n: p.stock })) : `${t(kind.stock)}: ${fmtNum(p.stock)}`}
        {p.sold > 0 && ` · ${t("{n} sold", { n: p.sold })}`}
      </p>
      {!!rows.length && (
        <dl className="detail-rows">
          {rows.map((r, i) => (
            <div key={i}>
              <dt dir="auto">{t(r.label)}</dt>
              <dd dir="auto">{r.tr ? t(r.value) : r.value}{r.unit && ` ${t(r.unit)}`}</dd>
            </div>
          ))}
        </dl>
      )}
      {p.description && <p className="product-desc" dir="auto">{p.description}</p>}

      <button className="card list-item shop-link" onClick={onShop}>
        <span className="icon-tile">{s.emoji}</span>
        <span className="grow">
          <b dir="auto">{s.name}</b>
          <span className="small muted" dir="auto" style={{ display: "block" }}>
            {s.distanceM != null ? formatDistance(s.distanceM) : ""} {s.address && `· ${s.address}`}
          </span>
        </span>
        <span className="muted chevron" aria-hidden>›</span>
      </button>

      {s.mine ? (
        <Button className="btn yellow block" onClick={onEdit}>✏️ {t("Edit product")}</Button>
      ) : toman ? (
        <div className="card buy-box contact-box">
          <b>🤝 {t("Paid to the seller directly")}</b>
          <p className="small muted" style={{ margin: "4px 0 10px" }}>{t("The game doesn't hold this money: agree with the seller, then pay them in person, by card, or on their payment page.")}</p>
          {why && <p className="small" style={{ color: "var(--yellow)", margin: "0 0 8px" }}>{why}</p>}
          <div className="row wrap">
            {contact.phone && <a className="btn green small" href={`tel:${contact.phone}`} dir="ltr">📞 {t("Call")} {contact.phone}</a>}
            {contact.payLink && !why && <a className="btn yellow small" href={contact.payLink} target="_blank" rel="noopener noreferrer nofollow">💳 {t("Pay the seller")}</a>}
            <Button className="btn cyan small" onClick={() => openChat(shopRoom(s.id, me.id), `${s.emoji} ${s.name}`)}>💬 {t("Message the seller")}</Button>
          </div>
          <p className="small muted" style={{ margin: "8px 0 0" }}>⚠️ {t("Never pay before you've seen it, and never share a bank code.")}</p>
        </div>
      ) : (
        <div className="card buy-box">
          {p.stock > 0 && s.live && !p.over && (
            <>
              <div className="row">
                <span className="grow">{t("Quantity")}</span>
                <div className="stepper qty-stepper">
                  <button onClick={() => setQty(Math.max(1, n - 1))} disabled={n <= 1} aria-label={t("Fewer")}>−</button>
                  <b>{fmtNum(n)}</b>
                  <button onClick={() => setQty(Math.min(max, n + 1))} disabled={n >= max} aria-label={t("More")}>+</button>
                </div>
              </div>
              <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={SHOP_LIMITS.note} placeholder={t("Note for the seller (size, color, when you'll come…)")} style={{ marginTop: 10 }} />
            </>
          )}
          <Button className="btn green block" style={{ marginTop: 10 }} disabled={!!why} onClick={buy}>
            🛍️ {t("Buy for {n} 🪙", { n: total })}
          </Button>
          {why ? <p className="small" style={{ color: "var(--yellow)", margin: "6px 0 0" }}>{why}</p> : <p className="small muted" style={{ margin: "8px 0 0" }}>🔒 {t("Your coins are held safely until you pick it up. Changed your mind? Cancel any time before pickup for a full refund.")}</p>}
          <button className="link-btn small" style={{ marginTop: 8 }} onClick={() => openChat(shopRoom(s.id, me.id), `${s.emoji} ${s.name}`)}>💬 {t("Ask the seller a question")}</button>
        </div>
      )}
      {!s.mine && <ReportButton shopId={s.id} productId={p.id} />}
    </div>
  );
}

/**
 * Report a product (or the shop): pick a reason, add a word if you like — it goes to a moderator
 * (Admin → Listings; reports from several players hide a product until someone has looked).
 */
function ReportButton({ shopId, productId }: { shopId: string; productId?: string }) {
  const { act } = useGame();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const send = async (reason: ReportReason) => {
    const note = await askText(t("Anything a moderator should know? (optional)"), "", { body: t("Reports are anonymous: the seller never sees who sent them.") });
    if (note == null) return;
    const ok = await act(() => api("/api/shops/report", { body: { shopId, productId: productId ?? null, reason, note } }));
    if (ok) (setSent(true), setOpen(false));
  };
  if (sent) return <p className="small muted report-row">✓ {t("Reported — thanks")}</p>;
  return (
    <div className="report-row">
      <button type="button" className="link-btn small muted" aria-expanded={open} onClick={() => setOpen(!open)}>🚩 {productId ? t("Report this product") : t("Report this shop")}</button>
      {open && (
        <div className="row wrap" style={{ gap: 6, marginTop: 6 }} role="group" aria-label={t("Why?")}>
          {REPORT_REASONS.map((r) => (
            <button key={r} type="button" className="chip small" onClick={() => void send(r)}>{t(REASON_LABEL[r])}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- my shop
type ShopChat = { room: string; buyer: { id: string; username: string; avatar: string }; last: string; fromBuyer: boolean; at: number };
type Mine = { shop: ShopView | null; orders: ShopOrder[]; stats: { pending: number; sold: number; earned: number } | null; chats?: ShopChat[] };

function MyShop({ go }: { go: (v: View) => void }) {
  const { act, me, refresh, openChat } = useGame();
  const { data, error, reload } = useApi<Mine>("/api/shops/mine");
  if (error && !data) return <div className="empty">{error}</div>;
  if (!data) return <div className="empty">{t("Loading…")}</div>;
  const s = data.shop;

  if (!s)
    return (
      <div className="shop-intro">
        <div className="shop-intro-art">🏪</div>
        <h3>{t("Open your own shop")}</h3>
        <p className="muted">{t("Sell anything to players around you — right where you stand.")}</p>
        <ul className="shop-perks">
          <li>📸 {t("Products with photos, prices and stock")}</li>
          <li>🔥 {t("Discounts with an end date, shown with the old price struck out")}</li>
          <li>🪟 {t("A shop window for your best products")}</li>
          <li>🔒 {t("Buyers pay in coins held safely until they pick up")}</li>
        </ul>
        <p className="small muted">{t("{cost} coins opens it for {days} days. Renew whenever you like.", { cost: S.shopOpenCost, days: S.shopDays })}</p>
        <Button className="btn yellow block big-btn" disabled={!S.shopsEnabled} onClick={() => go({ v: "setup" })}>
          🏪 {t("Open a shop")}
        </Button>
        {!S.shopsEnabled && <p className="small muted">{t("Shops are closed right now")}</p>}
        <Advertise />
      </div>
    );

  const left = s.expiresAt - Date.now();
  const featured = s.products.filter((p) => p.featured).length;
  const pending = data.orders.filter((o) => o.status === "PENDING");
  const toggle = (p: ShopProduct, field: "featured" | "active") =>
    act(() => api("/api/shops/products", { body: { action: "update", productId: p.id, [field]: !p[field] } })).then((ok) => ok && reload());
  const renew = () =>
    askConfirm(t("Renew {name}?", { name: s.name }), { body: t("{cost} coins keeps it open for {days} more days.", { cost: S.shopRenewCost, days: S.shopDays }), ok: t("Renew · {n} 🪙", { n: S.shopRenewCost }) }).then(
      (ok) => ok && act(() => api("/api/shops", { body: { action: "renew" } })).then((done) => done && (reload(), refresh())),
    );

  return (
    <>
      <div className="my-shop-head">
        <ShopBanner shop={s} />
        <div className="shop-head">
          <h3 dir="auto">{s.name}</h3>
          <div className="row wrap small">
            <span className={`tag ${s.live ? "tag-open" : "tag-closed"}`}>{s.live ? t("Open") : !s.open ? t("Paused") : t("Closed")}</span>
            <span className={left < SHOP_WARN_MS ? "warn-text" : "muted"}>
              {left > 0 ? t("{n, plural, one {# day left} other {# days left}}", { n: daysLeft(s.expiresAt) }) : t("Time ran out — renew to reopen")}
            </span>
          </div>
          <div className="row wrap" style={{ marginTop: 10 }}>
            <Button className={`btn small ${left < SHOP_WARN_MS ? "yellow" : "ghost"}`} onClick={renew}>🔁 {t("Renew · {n} 🪙", { n: S.shopRenewCost })}</Button>
            <Button className="btn ghost small" onClick={() => go({ v: "shop", id: s.id })}>👀 {t("View as a buyer")}</Button>
            <ShareButton title={s.name} text={s.tagline || undefined} url={shopUrl(s.id)} className="btn cyan small" />
            {left > 0 && (
              <Button className="btn ghost small" onClick={() => act(() => api("/api/shops", { body: { action: "update", open: !s.open } })).then((ok) => ok && reload())}>
                {s.open ? `⏸️ ${t("Pause sales")}` : `▶️ ${t("Reopen")}`}
              </Button>
            )}
          </div>
        </div>
      </div>

      <div className="grid3" style={{ margin: "10px 0" }}>
        <div className="stat"><b>{fmtNum(data.stats?.pending ?? 0)}</b><span>{t("To hand over")}</span></div>
        <div className="stat"><b>{fmtNum(data.stats?.sold ?? 0)}</b><span>{t("Sold")}</span></div>
        <div className="stat"><b>{fmtNum(data.stats?.earned ?? 0)}</b><span>{t("Coins earned")}</span></div>
      </div>

      <ScanCard shopId={s.id} />

      {!!pending.length && (
        <>
          <div className="sec-head"><b>📦 {t("Waiting for pickup")}</b></div>
          {pending.map((o) => <SellerOrder key={o.id} o={o} onChanged={() => (reload(), refresh())} />)}
        </>
      )}

      {!!data.chats?.length && (
        <>
          <div className="sec-head"><b>💬 {t("Messages from buyers")}</b></div>
          {data.chats.map((c) => (
            <button key={c.room} className="card list-item shop-link" onClick={() => openChat(c.room, `${c.buyer.avatar} ${c.buyer.username}`)}>
              <span className="icon-tile">{c.buyer.avatar}</span>
              <span className="grow" style={{ minWidth: 0 }}>
                <b dir="auto">{c.buyer.username}</b>
                <span className="small muted ellipsis" dir="auto" style={{ display: "block" }}>{c.fromBuyer ? "" : `${t("You")}: `}{c.last}</span>
              </span>
              <span className="small muted">{fmtTime(c.at)}</span>
            </button>
          ))}
        </>
      )}

      <div className="sec-head">
        <b>🛒 {t("Products")}</b>
        <span className="small muted">{fmtNum(s.products.length)}/{fmtNum(S.shopMaxProducts)}</span>
        <span className="grow" />
        <Button className="btn green small" disabled={s.products.length >= S.shopMaxProducts} onClick={() => go({ v: "edit", productId: null })}>＋ {t("Add product")}</Button>
      </div>
      {!s.products.length && <div className="empty">{t("Add your first product — a clear photo and a fair price sell best.")}</div>}
      {s.products.map((p) => (
        <div key={p.id} className={`card list-item my-prod ${p.active ? "" : "dim"}`}>
          <button className="my-prod-main" onClick={() => go({ v: "edit", productId: p.id })}>
            <Photo id={p.photos[0]} alt={p.title} fallback={s.emoji} className="thumb" />
            <span className="grow" style={{ minWidth: 0 }}>
              <b className="ellipsis" dir="auto" style={{ display: "block" }}>{p.title}</b>
              <Price price={p.price} priceNow={p.priceNow} deal={p.deal} currency={p.currency} />
              <span className="small muted" style={{ display: "block" }}>
                {p.stock ? t("{n} in stock", { n: p.stock }) : t("Sold out")} {p.sold > 0 && `· ${t("{n} sold", { n: p.sold })}`}
              </span>
              {p.review !== "ok" && (
                <span className={`review-badge ${p.review}`} title={p.reviewNote.split(" · ").map((k) => t(k)).join(" · ")}>
                  {p.review === "pending" ? `🕓 ${t("Waiting for a moderator")}` : `⛔ ${t("Turned down")}${p.reviewNote ? ` — ${p.reviewNote}` : ""}`}
                </span>
              )}
            </span>
          </button>
          <button className={`icon-toggle ${p.featured ? "on" : ""}`} onClick={() => toggle(p, "featured")} disabled={!p.featured && featured >= S.shopMaxFeatured} title={p.featured ? t("Take out of the shop window") : t("Put in the shop window")} aria-pressed={p.featured}>
            ⭐
          </button>
          <button className={`icon-toggle ${p.active ? "on" : ""}`} onClick={() => toggle(p, "active")} title={p.active ? t("Hide from buyers") : t("Show to buyers")} aria-pressed={p.active}>
            {p.active ? "👁️" : "🙈"}
          </button>
        </div>
      ))}
      {!!s.products.length && <p className="small muted">{t("⭐ = in the shop window ({n} of {max}) · 👁️ = visible to buyers", { n: featured, max: S.shopMaxFeatured })}</p>}

      <div className="sec-head"><b>⚙️ {t("Shop settings")}</b></div>
      <div className="row wrap">
        <Button className="btn ghost small" onClick={() => go({ v: "setup" })}>✏️ {t("Edit details")}</Button>
        <CoverButton hasCover={!!s.coverId} onDone={reload} />
        <Button
          className="btn ghost small"
          onClick={() =>
            askConfirm(t("Move your shop here?"), { body: t("Buyers will find it where you're standing now."), ok: t("Move here") }).then((ok) => ok && act(() => api("/api/shops", { body: { action: "move" } })).then((done) => done && reload()))
          }
        >
          📍 {t("Move it here")}
        </Button>
      </div>
      {me.shop && <p className="small muted" style={{ marginTop: 10 }}>{t("Market fee: {n}% of each sale, taken when you hand an order over.", { n: S.shopFeePct })}</p>}
      <Advertise />
    </>
  );
}

function CoverButton({ hasCover, onDone }: { hasCover: boolean; onDone: () => void }) {
  const { act, toast } = useGame();
  return (
    <>
      <label className="btn ghost small" style={{ margin: 0 }}>
        🖼️ {hasCover ? t("Change banner") : t("Add a banner")}
        <input
          type="file"
          accept="image/*"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            try {
              const photo = await resizePhoto(f, 1280);
              if (await act(() => api("/api/shops", { body: { action: "cover", photo } }))) onDone();
            } catch (err) {
              toast({ kind: "error", title: (err as Error).message });
            }
          }}
        />
      </label>
      {hasCover && (
        <Button className="btn ghost small" onClick={() => act(() => api("/api/shops", { body: { action: "cover", photo: null } })).then((ok) => ok && onDone())}>
          {t("Remove banner")}
        </Button>
      )}
    </>
  );
}

// ---------------------------------------------------------------- open / edit a shop
function ShopForm({ onDone }: { onDone: () => void }) {
  const { act, me, pos, toast, refresh } = useGame();
  const { data } = useApi<Mine>(me.shop ? "/api/shops/mine" : null);
  const existing = data?.shop ?? null;
  const [f, setF] = useState({ name: "", tagline: "", about: "", emoji: "🏪", category: "other", address: "", snappfood: "", torob: "", divar: "", phone: "", payLink: "" });
  const [cover, setCover] = useState<string | null>(null);
  const filled = useRef(false);
  useEffect(() => {
    if (!existing || filled.current) return;
    filled.current = true;
    setF({ name: existing.name, tagline: existing.tagline, about: existing.about, emoji: existing.emoji, category: existing.category, address: existing.address, snappfood: existing.snappfood, torob: existing.torob, divar: existing.divar, phone: existing.phone, payLink: existing.payLink });
  }, [existing]);
  if (me.shop && !existing) return <div className="empty">{t("Loading…")}</div>;

  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const short = f.name.trim().length < 2;
  const badPhone = !!f.phone.trim() && !cleanPhone(f.phone);
  const badLink = cleanPayLink(f.payLink) === null;
  const save = async () => {
    const ok = existing
      ? await act(() => api("/api/shops", { body: { action: "update", ...f } }))
      : await act(() => api("/api/shops", { body: { action: "create", ...f, cover: cover ?? undefined } }));
    if (ok) {
      if (!existing) sfx("reward");
      refresh();
      onDone();
    }
  };

  return (
    <div className="shop-form">
      {!existing && (
        <div className="cover-pick">
          {cover ? <img src={cover} alt="" /> : <span className="shop-cover-art">{categoryOf(f.category).emoji}</span>}
          <span className="shop-logo">{f.emoji}</span>
          <label className="btn ghost small cover-btn">
            🖼️ {cover ? t("Change banner") : t("Add a banner")}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                try {
                  setCover(await resizePhoto(file, 1280));
                } catch (err) {
                  toast({ kind: "error", title: (err as Error).message });
                }
              }}
            />
          </label>
        </div>
      )}
      <label>{t("Shop name")}</label>
      <input value={f.name} onChange={set("name")} maxLength={SHOP_LIMITS.name} placeholder={t("e.g. Sara's Bakery")} />
      <label>{t("Slogan (one line)")}</label>
      <input value={f.tagline} onChange={set("tagline")} maxLength={SHOP_LIMITS.tagline} placeholder={t("e.g. Fresh bread every morning")} />
      <label>{t("Sign")}</label>
      <div className="emoji-pick">
        {SHOP_EMOJIS.map((e) => (
          <button key={e} type="button" className={f.emoji === e ? "on" : ""} onClick={() => setF({ ...f, emoji: e })} aria-pressed={f.emoji === e}>
            {e}
          </button>
        ))}
      </div>
      <label>{t("Category")}</label>
      <select value={f.category} onChange={set("category")}>
        {SHOP_CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>{c.emoji} {t(c.label)}</option>
        ))}
      </select>
      <label>{t("How to find you")}</label>
      <input value={f.address} onChange={set("address")} maxLength={SHOP_LIMITS.address} placeholder={t("e.g. Next to the pharmacy, ground floor")} />
      <label>{t("About the shop")}</label>
      <textarea rows={3} value={f.about} onChange={set("about")} maxLength={SHOP_LIMITS.about} placeholder={t("What you sell, opening hours, how pickup works…")} />
      <OwnerLinkFields v={f} set={(k, v) => setF({ ...f, [k]: v })} at={pos} />
      <label>{t("Phone for buyers (optional)")}</label>
      <input type="tel" inputMode="tel" dir="ltr" value={f.phone} onChange={set("phone")} maxLength={30} placeholder="0912…" aria-invalid={badPhone} />
      <label>{t("Your payment page (optional)")}</label>
      <input type="url" inputMode="url" dir="ltr" value={f.payLink} onChange={set("payLink")} maxLength={300} placeholder="https://zarinp.al/…" aria-invalid={badLink} />
      <p className="small muted">{badPhone ? <span className="warn-text">{t("That phone number doesn't look right")}</span> : badLink ? <span className="warn-text">{t("The payment link must be a full https:// address")}</span> : t("Shown on products you price in toman: buyers pay you directly, the game never touches that money.")}</p>

      {!existing && (
        <div className="card small" style={{ marginTop: 12 }}>
          📍 {t("Your shop opens right where you're standing. You can move it later.")}
          <br />
          🗓️ {t("{cost} coins keeps it open for {days} days; renew any time.", { cost: S.shopOpenCost, days: S.shopDays })}
        </div>
      )}
      <Button className="btn yellow block big-btn" style={{ marginTop: 12 }} disabled={short || badPhone || badLink || (!existing && (!pos || me.coins < S.shopOpenCost))} onClick={save}>
        {existing ? `💾 ${t("Save")}` : `🏪 ${t("Open shop · {n} 🪙", { n: S.shopOpenCost })}`}
      </Button>
      {!existing && (short ? <p className="small muted">{t("Give your shop a name (at least 2 letters)")}</p> : !pos ? <p className="small warn-text">{t("Waiting for your location…")}</p> : me.coins < S.shopOpenCost ? <p className="small warn-text">{t("Not enough coins — you have {n}", { n: me.coins })}</p> : null)}
    </div>
  );
}

// ---------------------------------------------------------------- add / edit a product
type Pic = { id: string } | { local: string; key: number };
const DEAL_STEPS = [0, 10, 20, 30, 50];
const ENDS: ["none" | "24h" | "3d" | "7d", number | null][] = [
  ["none", null],
  ["24h", 86_400_000],
  ["3d", 3 * 86_400_000],
  ["7d", 7 * 86_400_000],
];
const endLabel = (k: (typeof ENDS)[number][0]) => (k === "none" ? t("No end date") : k === "24h" ? t("24 hours") : k === "3d" ? t("3 days") : t("1 week"));
/** <input type="datetime-local"> value for a time, in the phone's timezone. */
const localInput = (ms: number) => {
  const d = new Date(ms - new Date(ms).getTimezoneOffset() * 60_000);
  return d.toISOString().slice(0, 16);
};

/** One field of a product kind (lib/shopKinds.ts) in the seller's form. */
function KindField({ field, value, set }: { field: FieldDef; value: unknown; set: (v: unknown) => void }) {
  const digits = (v: string) => toAsciiDigits(v).replace(/\D/g, "");
  if (field.type === "bool")
    return (
      <div className="toggles">
        <button className={`toggle ${value === true ? "on" : ""}`} onClick={() => set(value === true ? undefined : true)} aria-pressed={value === true}>
          <i /> {t(field.label)}
        </button>
      </div>
    );
  const label = <label>{t(field.label)}{field.type === "datetime" && field.required ? " *" : ""}{field.type === "number" && field.unit ? ` (${t(field.unit)})` : ""}</label>;
  if (field.type === "select")
    return (
      <>
        {label}
        <select value={typeof value === "string" ? value : ""} onChange={(e) => set(e.target.value || undefined)}>
          <option value="">—</option>
          {field.options.map((o) => <option key={o.key} value={o.key}>{t(o.label)}</option>)}
        </select>
      </>
    );
  if (field.type === "datetime")
    return (
      <>
        {label}
        <input type="datetime-local" value={typeof value === "number" ? localInput(value) : ""} onChange={(e) => set(e.target.value ? new Date(e.target.value).getTime() : undefined)} aria-label={t(field.label)} />
      </>
    );
  if (field.type === "number")
    return (
      <>
        {label}
        <input inputMode="numeric" value={value == null ? "" : String(value)} onChange={(e) => set(digits(e.target.value) ? Math.min(field.max, Number(digits(e.target.value))) : undefined)} />
      </>
    );
  if (field.type === "pairs") {
    const pairs = Array.isArray(value) ? (value as Pair[]) : [];
    const put = (i: number, k: "k" | "v", v: string) => set(pairs.map((p, j) => (j === i ? { ...p, [k]: v } : p)));
    return (
      <>
        {label}
        {pairs.map((p, i) => (
          <div key={i} className="pair-row">
            <input value={p.k} onChange={(e) => put(i, "k", e.target.value)} maxLength={30} placeholder={t("e.g. Area")} aria-label={t("Name")} />
            <input value={p.v} onChange={(e) => put(i, "v", e.target.value)} maxLength={60} placeholder={t("e.g. 85 m²")} aria-label={t("Value")} />
            <button className="btn ghost small" onClick={() => set(pairs.filter((_, j) => j !== i))} aria-label={t("Remove")}>✕</button>
          </div>
        ))}
        {pairs.length < field.max && <button className="btn ghost small" onClick={() => set([...pairs, { k: "", v: "" }])}>＋ {t("Add a detail")}</button>}
      </>
    );
  }
  const str = typeof value === "string" ? value : "";
  return (
    <>
      {label}
      {field.type === "long" ? (
        <textarea rows={2} value={str} onChange={(e) => set(e.target.value)} maxLength={field.max} placeholder={field.hint ? t(field.hint) : undefined} />
      ) : (
        <input type={field.type === "phone" ? "tel" : "text"} inputMode={field.type === "phone" ? "tel" : undefined} dir={field.type === "phone" ? "ltr" : undefined} value={str} onChange={(e) => set(e.target.value)} maxLength={field.type === "phone" ? 30 : field.max} placeholder={field.hint ? t(field.hint) : undefined} />
      )}
    </>
  );
}

function ProductForm({ productId, onDone }: { productId: string | null; onDone: () => void }) {
  const { act, toast } = useGame();
  const { data } = useApi<Mine>("/api/shops/mine");
  const shop = data?.shop;
  const product = productId ? shop?.products.find((p) => p.id === productId) : null;
  const [f, setF] = useState({ title: "", description: "", price: "", stock: 1, discountPct: 0, discountUntil: null as number | null, featured: false, active: true, kind: "item" as ProductKind, currency: "coins" as Currency });
  const [det, setDet] = useState<Record<string, unknown>>({});
  const [pics, setPics] = useState<Pic[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const keyN = useRef(0);
  const filled = useRef(false);
  useEffect(() => {
    if (filled.current || !shop || (productId && !product)) return;
    filled.current = true;
    if (product) {
      setF({ title: product.title, description: product.description, price: String(product.price), stock: product.stock, discountPct: product.discountPct, discountUntil: product.discountUntil, featured: product.featured, active: product.active, kind: product.kind, currency: product.currency });
      setDet(product.details);
      setPics(product.photos.map((id) => ({ id })));
    }
  }, [shop, product, productId]);
  if (!shop) return <div className="empty">{t("Loading…")}</div>;
  if (productId && !product) return <div className="empty">{t("That product isn't in your shop")}</div>;

  const price = Number(f.price) || 0;
  const coins = f.currency === "coins";
  const kind = KINDS[f.kind];
  const salePrice = priceNow({ price, discountPct: f.discountPct, discountUntil: f.discountUntil });
  const windowUsed = shop.products.filter((p) => p.featured && p.id !== productId).length;
  const windowFull = !f.featured && windowUsed >= S.shopMaxFeatured;
  const missing = kind.fields.find((x) => x.type === "datetime" && x.required && typeof det[x.key] !== "number");
  const priceWhy = f.price === "" && coins ? "Set a price" : priceProblem(f.currency, price, S.shopMaxPrice);
  const problem =
    f.title.trim().length < 2 ? t("Give the product a name (at least 2 letters)") : priceWhy ? t(priceWhy, { n: S.shopMaxPrice }) : missing ? t("Pick the date and time") : f.discountPct > 0 && f.discountUntil != null && f.discountUntil <= Date.now() ? t("Pick a discount end time in the future") : null;
  const noContact = !coins && !shop.phone && !shop.payLink && !(f.kind === "ad" && cleanPhone(det.phone));
  // A new product takes the kind's usual currency (a ticket in toman, food in coins) until the seller picks one.
  const pickKind = (k: ProductKind) => setF({ ...f, kind: k, currency: productId ? f.currency : KINDS[k].currency });

  const addFiles = async (files: FileList | null) => {
    if (!files) return;
    const room = S.shopMaxPhotos - pics.length;
    const list = [...files].slice(0, room);
    if (files.length > room) toast({ kind: "error", title: t("Up to {n} photos per product", { n: S.shopMaxPhotos }) });
    for (const file of list) {
      try {
        const local = await resizePhoto(file);
        setPics((ps) => [...ps, { local, key: ++keyN.current }]);
      } catch (err) {
        toast({ kind: "error", title: (err as Error).message });
      }
    }
  };

  const save = async () => {
    if (problem) return;
    const fields = { title: f.title, description: f.description, price, kind: f.kind, details: det, currency: f.currency, stock: f.stock, discountPct: f.discountPct, discountUntil: f.discountPct ? f.discountUntil : null, featured: f.featured, active: f.active };
    const ok = await act(async () => {
      let id = productId;
      let message: string;
      if (id) message = (await api<{ message: string }>("/api/shops/products", { body: { action: "update", productId: id, ...fields } })).message;
      else {
        const r = await api<{ message: string; product: ShopProduct }>("/api/shops/products", { body: { action: "create", ...fields } });
        id = r.product.id;
        message = r.message;
      }
      // Photos: drop the removed ones, upload the new ones one by one, then put the first first.
      const kept = new Set(pics.filter((p): p is { id: string } => "id" in p).map((p) => p.id));
      for (const old of product?.photos ?? []) if (!kept.has(old)) await api("/api/shops/products", { body: { action: "removePhoto", productId: id, photoId: old } });
      const fresh = pics.filter((p): p is { local: string; key: number } => "local" in p);
      const ids: string[] = [];
      for (const [i, p] of pics.entries()) {
        if ("id" in p) ids.push(p.id);
        else {
          setStatus(t("Uploading photo {i} of {n}…", { i: fresh.indexOf(p) + 1, n: fresh.length }));
          ids.push((await api<{ photoId: string }>("/api/shops/products", { body: { action: "addPhoto", productId: id, photo: p.local } })).photoId);
          setPics((ps) => ps.map((x, j) => (j === i ? { id: ids[ids.length - 1] } : x))); // uploaded: never send it twice
        }
      }
      const wasFirst = product?.photos.find((x) => kept.has(x)) ?? null;
      if (ids.length > 1 && ids[0] !== wasFirst) await api("/api/shops/products", { body: { action: "firstPhoto", productId: id, photoId: ids[0] } });
      return { message };
    });
    setStatus(null);
    if (ok) onDone();
  };

  const remove = () =>
    askConfirm(t("Remove {title}?", { title: f.title }), { body: t("Open orders for it can still be handed over."), ok: t("Remove"), danger: true }).then(
      (ok) => ok && act(() => api("/api/shops/products", { body: { action: "delete", productId } })).then((done) => done && onDone()),
    );

  return (
    <div className="product-form">
      <label>{t("Photos ({n}/{max}) — the first one is the cover", { n: pics.length, max: S.shopMaxPhotos })}</label>
      <div className="photo-strip">
        {pics.map((p, i) => (
          <div key={"id" in p ? p.id : `l${p.key}`} className={`photo-thumb ${i === 0 ? "first" : ""}`}>
            <img src={"id" in p ? img(p.id) : p.local} alt="" />
            {i > 0 && (
              <button className="photo-first" onClick={() => setPics([p, ...pics.filter((_, j) => j !== i)])} title={t("Make it the cover")}>
                ★
              </button>
            )}
            <button className="photo-x" onClick={() => setPics(pics.filter((_, j) => j !== i))} aria-label={t("Remove photo")}>✕</button>
          </div>
        ))}
        {pics.length < S.shopMaxPhotos && (
          <label className="photo-add">
            <span>📸</span>
            <span className="small">{t("Add")}</span>
            <input type="file" accept="image/*" multiple hidden onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} />
          </label>
        )}
      </div>

      <label>{t("What are you selling?")}</label>
      <div className="kind-pick" role="radiogroup" aria-label={t("What are you selling?")}>
        {PRODUCT_KIND_KEYS.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={f.kind === k} className={f.kind === k ? "on" : ""} onClick={() => pickKind(k)}>
            <span aria-hidden>{KINDS[k].emoji}</span> {t(KINDS[k].label)}
          </button>
        ))}
      </div>
      <p className="small muted" style={{ margin: "4px 0 0" }}>{t(kind.what)}</p>

      <label>{t("Product name")}</label>
      <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={SHOP_LIMITS.title} placeholder={t("e.g. Handmade wool scarf")} />
      <label>{t("Description")}</label>
      <textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={SHOP_LIMITS.description} placeholder={t("Size, color, condition, what's included…")} />

      {kind.fields.map((field) => (
        <KindField key={`${f.kind}-${field.key}`} field={field} value={det[field.key]} set={(v) => setDet((d) => ({ ...d, [field.key]: v }))} />
      ))}

      <label>{t("Paid in")}</label>
      <div className="tabs">
        <button className={coins ? "on" : ""} onClick={() => setF({ ...f, currency: "coins" })}>🪙 {t("Coins, in the game")}</button>
        <button className={!coins ? "on" : ""} onClick={() => setF({ ...f, currency: "toman" })}>💵 {t("Toman, to you directly")}</button>
      </div>
      <p className="small muted" style={{ margin: "4px 0 0" }}>
        {coins ? t("Buyers pay in coins, held safely until they pick it up.") : t("Like a classified ad: buyers call, message or pay you on your own payment page. The game never touches that money.")}
      </p>
      {noContact && (
        <p className="small warn-text">
          {t("Add your phone or payment page in the shop details so buyers can pay you — until then they can only message you.")}
        </p>
      )}

      <div className="grid2">
        <div>
          <label>{coins ? t("Price (🪙)") : t("Price (toman)")}</label>
          <input inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: toAsciiDigits(e.target.value).replace(/\D/g, "").replace(/^0+(?=\d)/, "").slice(0, coins ? 9 : 12) })} placeholder={coins ? "100" : t("0 = ask the seller")} />
        </div>
        <div>
          <label>{t(kind.stock)}</label>
          <div className="stepper qty-stepper">
            <button onClick={() => setF({ ...f, stock: Math.max(0, f.stock - 1) })} aria-label={t("Fewer")}>−</button>
            <input inputMode="numeric" value={String(f.stock)} onChange={(e) => setF({ ...f, stock: Math.min(9999, Number(toAsciiDigits(e.target.value).replace(/\D/g, "")) || 0) })} aria-label={t(kind.stock)} />
            <button onClick={() => setF({ ...f, stock: Math.min(9999, f.stock + 1) })} aria-label={t("More")}>+</button>
          </div>
        </div>
      </div>

      <label>{t("Discount")}</label>
      <div className="tabs">
        {DEAL_STEPS.map((d) => (
          <button key={d} className={f.discountPct === d ? "on" : ""} onClick={() => setF({ ...f, discountPct: d })}>
            {d ? t("{n}%", { n: d }) : t("None")}
          </button>
        ))}
        <input
          className="deal-input"
          inputMode="numeric"
          value={DEAL_STEPS.includes(f.discountPct) ? "" : String(f.discountPct)}
          onChange={(e) => setF({ ...f, discountPct: Math.min(MAX_DISCOUNT, Number(toAsciiDigits(e.target.value).replace(/\D/g, "")) || 0) })}
          placeholder={t("Other %")}
          aria-label={t("Other %")}
        />
      </div>
      {f.discountPct > 0 && (
        <>
          <label>{t("Discount ends")}</label>
          <div className="tabs">
            {ENDS.map(([k, ms]) => (
              <button key={k} className={(ms === null ? f.discountUntil === null : false) ? "on" : ""} onClick={() => setF({ ...f, discountUntil: ms === null ? null : Date.now() + ms })}>
                {endLabel(k)}
              </button>
            ))}
          </div>
          <input type="datetime-local" value={f.discountUntil ? localInput(f.discountUntil) : ""} onChange={(e) => setF({ ...f, discountUntil: e.target.value ? new Date(e.target.value).getTime() : null })} aria-label={t("Discount ends")} />
          {price > 0 && (
            <p className="small" style={{ color: "var(--green)" }}>
              {coins ? t("Buyers pay {now} 🪙 instead of {was} 🪙", { now: salePrice, was: price }) : t("Buyers pay {now} instead of {was}", { now: money(salePrice, "toman"), was: money(price, "toman") })}
              {f.discountUntil ? ` · ${t("until {when}", { when: fmtTime(f.discountUntil) })}` : ""}
            </p>
          )}
        </>
      )}

      <div className="toggles">
        <button className={`toggle ${f.featured ? "on" : ""}`} disabled={windowFull} onClick={() => setF({ ...f, featured: !f.featured })} aria-pressed={f.featured}>
          <i /> 🪟 {t("In the shop window ({n} of {max} used)", { n: windowUsed + (f.featured ? 1 : 0), max: S.shopMaxFeatured })}
        </button>
        <button className={`toggle ${f.active ? "on" : ""}`} onClick={() => setF({ ...f, active: !f.active })} aria-pressed={f.active}>
          <i /> 👁️ {t("Visible to buyers")}
        </button>
      </div>
      {price > 0 && coins && <p className="small muted">{t("You receive {n} 🪙 per sale after the {fee}% market fee.", { n: salePrice - shopFee(salePrice), fee: S.shopFeePct })}</p>}

      <Button className="btn yellow block big-btn" style={{ marginTop: 12 }} disabled={!!problem} onClick={save}>
        {status ?? (productId ? `💾 ${t("Save")}` : `✅ ${t("Put it on sale")}`)}
      </Button>
      {problem && <p className="small warn-text">{problem}</p>}
      {productId && (
        <Button className="btn ghost small" style={{ marginTop: 12 }} onClick={remove}>
          🗑️ {t("Remove product")}
        </Button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- orders
function Orders({ initialSide, highlight, onShop }: { initialSide: "buying" | "selling"; highlight?: string; onShop: (id: string) => void }) {
  const { me, refresh } = useGame();
  const [side, setSide] = useState<"buying" | "selling">(me.shop ? initialSide : "buying");
  const buying = useApi<{ orders: ShopOrder[] }>(side === "buying" ? "/api/shops/orders" : null);
  const selling = useApi<Mine>(side === "selling" ? "/api/shops/mine" : null);
  const list = side === "buying" ? buying.data?.orders : selling.data?.orders;
  const reload = () => {
    (side === "buying" ? buying.reload : selling.reload)();
    refresh();
  };
  // Keep an eye on open orders: pickups happen while the screen is open.
  useEffect(() => {
    const i = setInterval(() => (side === "buying" ? buying.reload : selling.reload)(), 15_000);
    return () => clearInterval(i);
  }, [side]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      {me.shop && (
        <div className="tabs">
          <button className={side === "buying" ? "on" : ""} onClick={() => setSide("buying")}>🛍️ {t("I bought")}</button>
          <button className={side === "selling" ? "on" : ""} onClick={() => setSide("selling")}>
            🏪 {t("I sold")} {me.shop.pending > 0 && `(${fmtNum(me.shop.pending)})`}
          </button>
        </div>
      )}
      {!list && <div className="empty">{t("Loading…")}</div>}
      {list && !list.length && <div className="empty">{side === "buying" ? t("No orders yet. Find something you like in the shops!") : t("No orders yet.")}</div>}
      {list?.map((o) => (side === "buying" ? <BuyerOrder key={o.id} o={o} fresh={o.id === highlight} onChanged={reload} onShop={() => onShop(o.shop.id)} /> : <SellerOrder key={o.id} o={o} onChanged={reload} />))}
    </>
  );
}

const statusLabel = (o: ShopOrder) =>
  o.status === "PENDING" ? t("⏳ Waiting for pickup") : o.status === "DONE" ? t("✅ Picked up") : o.cancelledBy === "expired" ? t("⌛ Expired · refunded") : t("↩️ Cancelled · refunded");

function OrderHead({ o }: { o: ShopOrder }) {
  return (
    <div className="row order-head">
      <Photo id={o.photo} alt={o.title} fallback={o.shop.emoji} className="thumb" />
      <div className="grow" style={{ minWidth: 0 }}>
        <b className="ellipsis" style={{ display: "block" }}>{t("{qty}× {title}", { qty: o.qty, title: o.title })}</b>
        <span className="small muted">{fmtNum(o.total)} 🪙 · {fmtTime(o.createdAt)}</span>
        <span className={`tag order-${o.status.toLowerCase()}`} style={{ display: "table", marginTop: 4 }}>{statusLabel(o)}</span>
      </div>
    </div>
  );
}

function BuyerOrder({ o, fresh, onChanged, onShop }: { o: ShopOrder; fresh?: boolean; onChanged: () => void; onShop: () => void }) {
  const { act } = useGame();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (fresh) revealInSheet(ref.current);
  }, [fresh]);
  return (
    <div ref={ref} className={`card order-card ${fresh ? "hl" : ""}`}>
      <OrderHead o={o} />
      {o.status === "PENDING" && o.code && (
        <>
          <div className="pickup-code">
            <span className="small">{t("Show this code at the shop")}</span>
            <b className="mono" dir="ltr">{o.code}</b>
          </div>
          <p className="small muted" style={{ margin: "6px 0" }}>
            🏪 <a href="#" onClick={(e) => (e.preventDefault(), onShop())}>{o.shop.emoji} {o.shop.name}</a>
            {o.shop.address && ` · ${o.shop.address}`}
            <br />⏰ {t("Pick it up by {when} or it's refunded automatically", { when: fmtTime(o.refundAt) })}
          </p>
          <div className="row wrap">
            <GoToShop to={o.shop} />
            <Button
              className="btn ghost small"
              onClick={() => askConfirm(t("Cancel this order?"), { body: t("You get all {n} coins back.", { n: o.total }), ok: t("Cancel order"), cancel: t("Keep it"), danger: true }).then((ok) => ok && act(() => api("/api/shops/orders", { body: { action: "cancel", orderId: o.id } })).then((done) => done && onChanged()))}
            >
              {t("Cancel & refund")}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function SellerOrder({ o, onChanged }: { o: ShopOrder; onChanged: () => void }) {
  const { act } = useGame();
  const [code, setCode] = useState("");
  return (
    <div className="card order-card">
      <OrderHead o={o} />
      <p className="small" style={{ margin: "6px 0" }}>
        {o.buyer.avatar} <b>{o.buyer.username}</b> · {t("you get {n} 🪙", { n: o.total - o.fee })}
        {o.note && <span className="order-note" dir="auto">“{o.note}”</span>}
      </p>
      {o.status === "PENDING" && (
        <>
          <div className="row">
            <input
              className="grow code-input"
              inputMode="numeric"
              maxLength={4}
              dir="ltr"
              placeholder={t("Buyer's code")}
              value={code}
              onChange={(e) => setCode(toAsciiDigits(e.target.value).replace(/\D/g, "").slice(0, 4))}
              aria-label={t("Buyer's code")}
            />
            <Button className="btn green small" disabled={code.length !== 4} onClick={() => act(() => api("/api/shops/orders", { body: { action: "handover", orderId: o.id, code } })).then((ok) => ok && (setCode(""), onChanged()))}>
              🤝 {t("Hand over")}
            </Button>
          </div>
          <Button
            className="btn ghost small"
            style={{ marginTop: 8 }}
            onClick={() => askConfirm(t("Cancel this order?"), { body: t("The buyer gets all {n} coins back and the items go back on your shelves.", { n: o.total }), ok: t("Cancel order"), cancel: t("Keep it"), danger: true }).then((ok) => ok && act(() => api("/api/shops/orders", { body: { action: "cancel", orderId: o.id } })).then((done) => done && onChanged()))}
          >
            {t("Can't sell it — cancel & refund")}
          </Button>
          <p className="small muted" style={{ margin: "6px 0 0" }}>⏰ {t("Hand it over by {when} or it's refunded automatically", { when: fmtTime(o.refundAt) })}</p>
        </>
      )}
    </div>
  );
}
