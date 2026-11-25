"use client";
// Inside a store in the 3D city: walk up to one on foot and "🚪 Enter (B)" — you're standing in its room
// (interior3d.ts: laid out for its trade, its real menu or catalogue on the shelves with price tags, the keeper behind
// the counter; or the owner's own 3D scan of the store). Drag to look round, tap the floor or use WASD to walk, tap
// a thing on a shelf to look at it and put it in the basket, tap the keeper to ask what's good, walk out of the door to
// leave. "📋 Menu" opens the whole list (a tap there walks you to the thing on its shelf). This HUD is drawn over it.
// The shopkeeper's words come from the store's real data (Snappfood's menu, Torob's catalogue, its hours — lib/street/
// shopTalk.ts) and are spoken. Paying: a real store's order is finished on its own site (Snappfood) — the game takes no
// money; a player's shop (id "sh:…") sells for coins right here (held until pickup, /api/shops/orders), and its toman
// things are paid to the seller directly (call, or their payment page). Without 3D (no WebGL) it's the list alone.
// Styles: app/drive-talk.css (.shop…).
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtNum, getLocale, msg, t } from "@/lib/i18n";
import { snappfoodMenuUrl, weekFromOsm, zoneOf, type MenuItem, type MenuSection, type StoreData } from "@/lib/localData";
import { shopSay, type ShopAct, type ShopItem } from "@/lib/street/shopTalk";
import { contactOf, KINDS, kindLine, type ProductKind } from "@/lib/shopKinds";
import { roomKindForShop } from "@/lib/interior";
import { storeKind } from "@/lib/storeKinds";
import { askConfirm } from "@/components/Dialogs";
import { OpenBadge, useLocal } from "../game/StoreInfo";
import { api, fmtTime, type ShopView } from "../game/client";
import { sfx } from "../game/sfx";
import { useGame } from "../game/ui";
import type { ScanInfo } from "../game/ScanCard";
import type { Interior, InteriorHit, InteriorSpec } from "./interior3d";
import { queryOf, useDeals, type StoreTarget } from "./StoreCard";

/** A thing on the shelves: a menu line, a catalogue product, or a player's product (coins or toman). */
type Thing = MenuItem & { coins?: boolean; stock?: number; over?: boolean; kind?: ProductKind; details?: unknown };
type Section = { title: string; items: Thing[] };
type Basket = Map<string, { item: Thing; n: number }>;
export type RoomApi = { open: (spec: Omit<InteriorSpec, "lite">, onLeave: () => void) => Interior | null; close: () => void };

const ASKS: { act: ShopAct; emoji: string; label: string }[] = [
  { act: "recommend", emoji: "⭐", label: msg("What do you recommend?") },
  { act: "offers", emoji: "🏷️", label: msg("Any discounts?") },
  { act: "hours", emoji: "🕘", label: msg("When do you close?") },
];
const kindFmt = { num: (n: number) => fmtNum(n), date: (ms: number) => fmtTime(ms) };
const priceOf = (it: Thing) => it.priceNow || it.price;
const money = (it: Thing, n = priceOf(it)) => (it.coins ? `${fmtNum(n)} 🪙` : t("{n} toman", { n: fmtNum(n) }));

/** A player's shop, with its products as shelves (by kind; a menu's own sections for food). */
function usePlayerShop(s: StoreTarget) {
  const id = s.id.startsWith("sh:") ? s.id.slice(3) : null;
  const [shop, setShop] = useState<(ShopView & { scan?: ScanInfo | null }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!id) return;
    let live = true;
    api<{ shop: ShopView & { scan?: ScanInfo | null } }>(`/api/shops/${encodeURIComponent(id)}?lat=${s.lat}&lng=${s.lng}`)
      .then((r) => live && setShop(r.shop))
      .catch((e: Error) => live && setError(e.message || "error"));
    return () => {
      live = false;
    };
  }, [id, s.lat, s.lng, tick]);
  const sections = useMemo<Section[]>(() => {
    if (!shop) return [];
    const by = new Map<string, Thing[]>();
    for (const p of shop.products) {
      if (!p.active) continue;
      const sec = p.kind === "food" && typeof (p.details as { section?: unknown })?.section === "string" ? String((p.details as { section: string }).section) : t(KINDS[p.kind].label);
      const line = kindLine(p.kind, p.details, kindFmt);
      const thing: Thing = {
        id: p.id, title: p.title, about: line || p.description.slice(0, 80), price: p.price, priceNow: p.priceNow, photo: p.photos[0] ? `/shop-img/${p.photos[0]}` : "",
        coins: p.currency === "coins", stock: p.stock, over: p.over, kind: p.kind, details: p.details,
      };
      by.set(sec, [...(by.get(sec) ?? []), thing]);
    }
    return [...by].map(([title, items]) => ({ title, items }));
  }, [shop]);
  return { id, shop, sections, error, reload: () => setTick((n) => n + 1) };
}

export function ShopScreen({ s, onClose, say, room }: { s: StoreTarget; onClose: () => void; /** The shopkeeper says this aloud. */ say: (text: string) => void; room: RoomApi | null }) {
  const { act, refresh } = useGame();
  const player = usePlayerShop(s);
  const { data, error } = useLocal<StoreData>(player.id ? null : queryOf(s));
  const deals = useDeals(player.id ? null : s);
  const sections = useMemo<Section[]>(() => {
    if (player.id) return player.sections;
    if (data?.menu?.sections.length) return data.menu.sections;
    // A shop with no menu: its products on Torob, as one shelf.
    const items = (data?.torob ?? []).filter((x) => x.price > 0).slice(0, 40).map((x, i) => ({ id: `tb${i}`, title: x.title, about: x.shop, price: x.price, priceNow: x.price, photo: x.photo }));
    return items.length ? [{ title: t("Products"), items }] : [];
  }, [data, player.id, player.sections]);
  const all = useMemo(() => sections.flatMap((x) => x.items.map((it) => ({ ...it, section: x.title }))), [sections]);
  const ready = player.id ? !!player.shop || !!player.error : !!data || !!error;
  const week = player.id ? null : data ? data.about.week ?? weekFromOsm(data.about.hours) ?? data.menu?.week ?? null : null;
  const storeName = player.shop?.name || data?.about.name || s.name;
  const coinsShop = !!player.id && all.length > 0 && all.every((x) => x.coins);
  const [tab, setTab] = useState(0);
  const [basket, setBasket] = useState<Basket>(new Map());
  const [line, setLine] = useState<string>("");
  const [ask, setAsk] = useState<string>("");
  const [picked, setPicked] = useState<string | null>(null);
  const [list, setList] = useState(false);
  /** The room is drawn (else the list is the whole screen). */
  const [in3d, setIn3d] = useState(false);
  const roomRef = useRef<Interior | null>(null);
  const lastSay = useRef(0);

  /** The shopkeeper answers (written in their bubble, spoken aloud). */
  const answer = (a: ShopAct, extra: { item?: ShopItem & { coins?: boolean }; basket?: { n: number; total: number } } = {}, asked = "") => {
    const coins = extra.item ? !!extra.item.coins : coinsShop;
    const l = shopSay(a, { store: storeName, sections, week, at: new Date(), timeZone: zoneOf(s), num: fmtNum, coins, ...extra });
    const text = t(l.key, l.params);
    setAsk(asked);
    setLine(text);
    // Not a voice per tap when someone fills a basket fast.
    if (performance.now() - lastSay.current > 900 || a !== "price") say(text), (lastSay.current = performance.now());
  };

  // In we go: the room is built once the store's things are known (or couldn't be had); welcomed then.
  const leaveRef = useRef<() => void>(() => {});
  useEffect(() => {
    if (!ready) return;
    const kind = player.id ? roomKindForShop(player.shop?.category ?? s.cls ?? "", storeName) : storeKind(s.cls, s.name);
    const scan = player.shop?.scan && player.id ? { url: `/shop-scan/${player.id}?v=${player.shop.scan.version}`, turn: player.shop.scan.turn } : null;
    const r = room?.open({ id: s.id, kind, name: storeName, color: s.color, items: all, price: (it) => money(it as Thing), scan }, () => leaveRef.current()) ?? null;
    roomRef.current = r;
    setIn3d(!!r);
    answer("welcome");
    return () => {
      roomRef.current = null;
      room?.close();
    };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape (or the phone's Back) closes the list, then leaves the shop.
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && (list && in3d ? setList(false) : leave());
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const lines = [...basket.values()];
  const n = lines.reduce((a, x) => a + x.n, 0);
  const coinTotal = lines.reduce((a, x) => a + (x.item.coins ? x.n * priceOf(x.item) : 0), 0);
  const tomanTotal = lines.reduce((a, x) => a + (x.item.coins ? 0 : x.n * priceOf(x.item)), 0);
  const add = (item: Thing, d: number) => {
    if (d > 0 && (item.over || item.stock === 0)) return answer("price", { item }, item.title);
    setBasket((b) => {
      const next = new Map(b), had = next.get(item.id)?.n ?? 0, k = Math.max(0, Math.min(item.stock ?? 99, had + d));
      if (k) next.set(item.id, { item, n: k });
      else next.delete(item.id);
      return next;
    });
    if (d > 0) (answer("price", { item }, item.title), sfx("tap"));
  };
  const pick = (id: string | null, walk = false) => {
    setPicked(id);
    roomRef.current?.highlight(id);
    if (id && walk) roomRef.current?.focus(id);
  };
  function leave() {
    say(t(shopSay("bye", { store: storeName, sections, week, at: new Date(), num: fmtNum }).key));
    onClose();
  }
  leaveRef.current = leave;

  // The room under the HUD: drag to look, tap to pick / walk / talk.
  const drag = useRef<{ x: number; y: number; x0: number; y0: number; at: number; id: number } | null>(null);
  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, at: performance.now(), id: e.pointerId };
  };
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    roomRef.current?.look(e.clientX - d.x, e.clientY - d.y);
    d.x = e.clientX;
    d.y = e.clientY;
  };
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 8 || performance.now() - d.at > 450) return;
    const r = e.currentTarget.getBoundingClientRect();
    const hit: InteriorHit = roomRef.current?.tap(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1) ?? null;
    if (!hit) return pick(null);
    if (hit.kind === "item") {
      const it = all.find((x) => x.id === hit.id);
      if (it) (pick(it.id), answer("price", { item: it }, it.title));
    } else if (hit.kind === "keeper") answer("recommend", {}, t("What do you recommend?"));
    else if (hit.kind === "door") leave();
    else if (hit.kind === "board") setList(true);
  };

  const pay = () =>
    askConfirm(t("Pay {n} coins?", { n: fmtNum(coinTotal) }), {
      body: t("The coins are held safely until you pick it up at {shop}. You'll get a pickup code to show the seller.", { shop: storeName }),
      ok: t("Pay {n} 🪙", { n: fmtNum(coinTotal) }),
    }).then(
      (ok) =>
        ok &&
        act(async () => {
          const codes: string[] = [];
          for (const { item, n: qty } of lines.filter((x) => x.item.coins)) {
            const r = await api<{ order: { code?: string | null } }>("/api/shops/orders", { body: { action: "buy", productId: item.id, qty, price: priceOf(item) } });
            if (r.order.code) codes.push(r.order.code);
            setBasket((b) => {
              const next = new Map(b);
              next.delete(item.id);
              return next;
            });
          }
          sfx("coin");
          refresh();
          player.reload();
          return { message: codes.length ? t("Paid! Your pickup code: {code} (also in Market → My purchases)", { code: codes.join(" · ") }) : t("Paid!") };
        }),
    );

  const site = player.id ? null : data?.menu ? data.menu.vendor.url || snappfoodMenuUrl(data.menu.vendor.code) : data?.links?.[0]?.url;
  const contact = player.shop && tomanTotal > 0 ? contactOf(lines.find((x) => !x.item.coins)?.item.kind ?? "item", lines.find((x) => !x.item.coins)?.item.details, player.shop) : null;
  const cover = data?.menu?.cover || data?.about.photo || deals[0]?.photos[0];
  const shelf = sections[Math.min(tab, Math.max(0, sections.length - 1))];
  const fa = getLocale() === "fa";
  const it = picked ? all.find((x) => x.id === picked) ?? null : null;
  const showList = list || !in3d;

  return (
    <div className={`shop${in3d ? " in3d" : ""}`} role="dialog" aria-modal="true" aria-label={t("Inside {store}", { store: storeName })} style={{ "--trade": s.color } as React.CSSProperties}>
      {in3d && <div className="shop-stage" aria-label={t("Drag to look round, tap to walk or pick")} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => (drag.current = null)} />}
      <header className="shop-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover && !in3d && <img className="shop-cover" src={cover} alt="" referrerPolicy="no-referrer" onError={(e) => e.currentTarget.remove()} />}
        <button type="button" className="shop-leave" onClick={leave}>{fa ? "›" : "‹"} {t("Leave")}</button>
        <div className="shop-title">
          <b dir="auto">{s.emoji} {storeName}</b>
          <span className="shop-meta">
            {!!data?.menu?.vendor.rating && <span>⭐ {fmtNum(data.menu.vendor.rating)}</span>}
            {player.id ? <span>{t("Player shop")}</span> : <OpenBadge week={week} at={s} />}
          </span>
        </div>
        {in3d && sections.length > 0 && (
          <button type="button" className="shop-list-btn" aria-expanded={list} onClick={() => setList((v) => !v)}>📋 {t("Menu")}</button>
        )}
      </header>

      <section className="shop-keeper" aria-live="polite">
        <span className="shop-face" aria-hidden>🧔‍♂️</span>
        <div className="shop-bubble">
          {ask && <small className="shop-asked" dir="auto">{ask}</small>}
          <p dir="auto">{line || (ready ? "…" : t("The shopkeeper is looking up from the counter…"))}</p>
        </div>
      </section>

      {in3d && !showList && (
        <div className="shop-bottom">
          {it ? (
            <div className="shop-pick">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {it.photo ? <img src={it.photo} alt="" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : <span className="shop-ph" aria-hidden>{s.emoji}</span>}
              <span className="grow">
                <b dir="auto">{it.title}</b>
                {it.about && <small dir="auto">{it.about}</small>}
                <span className="shop-price">
                  {priceOf(it) < it.price ? <s>{fmtNum(it.price)}</s> : null}
                  <b>{money(it)}</b>
                  {it.over ? <em>{t("That's already over")}</em> : it.stock === 0 ? <em>{t("Sold out")}</em> : null}
                </span>
              </span>
              <button type="button" className="btn small yellow" disabled={it.over || it.stock === 0} onClick={() => add(it, 1)}>＋ {t("Add")}</button>
              <button type="button" className="shop-x" aria-label={t("Close")} onClick={() => pick(null)}>×</button>
            </div>
          ) : (
            <div className="shop-asks" role="group" aria-label={t("Ask the shopkeeper")}>
              {ASKS.map((a) => (
                <button key={a.act} type="button" onClick={() => answer(a.act, {}, t(a.label))}>
                  <span aria-hidden>{a.emoji}</span> {t(a.label)}
                </button>
              ))}
            </div>
          )}
          <p className="shop-hint small">{t("Drag to look · tap the floor to walk · tap a thing to see it")}</p>
        </div>
      )}

      {showList && (
        <div className={in3d ? "shop-sheet" : "shop-flat"}>
          {!in3d && (
            <div className="shop-asks" role="group" aria-label={t("Ask the shopkeeper")}>
              {ASKS.map((a) => (
                <button key={a.act} type="button" onClick={() => answer(a.act, {}, t(a.label))}>
                  <span aria-hidden>{a.emoji}</span> {t(a.label)}
                </button>
              ))}
            </div>
          )}
          {sections.length > 1 && (
            <nav className="shop-tabs" role="tablist" aria-label={t("Menu")}>
              {sections.map((sec, i) => (
                <button key={`${sec.title}${i}`} type="button" role="tab" aria-selected={i === tab} className={i === tab ? "on" : ""} onClick={() => setTab(i)} dir="auto">{sec.title}</button>
              ))}
            </nav>
          )}
          <main className="shop-shelf">
            {!ready && <div className="shop-wait" aria-busy="true">{[0, 1, 2, 3].map((i) => <i key={i} />)}</div>}
            {ready && !sections.length && <p className="shop-empty">{player.error ? player.error : t("No prices for this store yet — ask the shopkeeper, or look it up on its site.")}</p>}
            {shelf && (
              <ul className="shop-items">
                {shelf.items.map((x) => {
                  const inB = basket.get(x.id)?.n ?? 0, off = priceOf(x) < x.price;
                  return (
                    <li key={x.id} className={inB ? "in" : ""}>
                      <button type="button" className="shop-item" onClick={() => (in3d && roomRef.current?.has(x.id) ? (pick(x.id, true), setList(false), answer("price", { item: x }, x.title)) : add(x, 1))} aria-label={t("Add {item}", { item: x.title })}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {x.photo ? <img src={x.photo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : <span className="shop-ph" aria-hidden>{s.emoji}</span>}
                        <span className="shop-item-tx">
                          <b dir="auto">{x.title}</b>
                          {x.about && <small dir="auto">{x.about}</small>}
                          <span className="shop-price">
                            {off ? <s>{fmtNum(x.price)}</s> : null}
                            <b>{money(x)}</b>
                          </span>
                        </span>
                      </button>
                      {inB > 0 ? (
                        <span className="shop-qty">
                          <button type="button" onClick={() => add(x, -1)} aria-label={t("Less")}>−</button>
                          <output>{fmtNum(inB)}</output>
                          <button type="button" onClick={() => add(x, 1)} aria-label={t("More")}>+</button>
                        </span>
                      ) : in3d ? (
                        <span className="shop-qty"><button type="button" onClick={() => add(x, 1)} aria-label={t("Add {item}", { item: x.title })}>+</button></span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </main>
        </div>
      )}

      <footer className="shop-foot">
        <div className="grow">
          <b>{n ? [coinTotal ? `${fmtNum(coinTotal)} 🪙` : "", tomanTotal ? t("{n} toman", { n: fmtNum(tomanTotal) }) : ""].filter(Boolean).join(" · ") : t("Your basket is empty")}</b>
          {n > 0 && <small>{t("{n} things", { n: fmtNum(n) })}</small>}
        </div>
        {n > 0 && !coinTotal && <button type="button" className="btn small ghost" onClick={() => answer("checkout", { basket: { n, total: tomanTotal } }, t("How much is it all?"))}>{t("At the counter")}</button>}
        {coinTotal > 0 && <button type="button" className="btn small yellow" onClick={pay}>{t("Pay {n} 🪙", { n: fmtNum(coinTotal) })}</button>}
        {contact?.phone && <a className="btn small ghost" href={`tel:${contact.phone}`}>📞 {t("Call")}</a>}
        {contact?.payLink && <a className="btn small yellow" href={contact.payLink} target="_blank" rel="noopener noreferrer nofollow">💳 {t("Pay the seller")}</a>}
        {site && (
          <a className="btn small yellow" href={site} target="_blank" rel="noreferrer noopener">
            {data?.menu ? t("Order on Snappfood") : t("Its site")} ↗
          </a>
        )}
      </footer>
    </div>
  );
}
