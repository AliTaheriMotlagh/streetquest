"use client";
// Inside a store in the 3D city: walk up to one on foot and "🚪 Enter (B)" — the whole screen becomes
// the shop. The shopkeeper at the counter welcomes you (by the time of day, or "we're closed"), and
// you can ask them what's good, what's on offer, when they close; tapping a dish or a product puts
// it in your basket and they tell you its price; at the counter they add it up. Everything they say
// comes from the store's real data (Snappfood's menu, Torob's catalogue, its hours — lib/street/
// shopTalk.ts) and is spoken (the on-device Persian voice, else the phone's own). The order itself
// is finished on the store's site (Snappfood) — the game doesn't take payments. Styles: app/drive-shop.css.
import { useEffect, useMemo, useRef, useState } from "react";
import { fmtNum, getLocale, msg, t } from "@/lib/i18n";
import { snappfoodMenuUrl, weekFromOsm, zoneOf, type MenuSection, type StoreData } from "@/lib/localData";
import { shopSay, type ShopAct, type ShopItem } from "@/lib/street/shopTalk";
import { OpenBadge, useLocal } from "../game/StoreInfo";
import { queryOf, useDeals, type StoreTarget } from "./StoreCard";

type Basket = Map<string, { item: MenuSection["items"][number]; n: number }>;
const ASKS: { act: ShopAct; emoji: string; label: string }[] = [
  { act: "recommend", emoji: "⭐", label: msg("What do you recommend?") },
  { act: "offers", emoji: "🏷️", label: msg("Any discounts?") },
  { act: "hours", emoji: "🕘", label: msg("When do you close?") },
];

export function ShopScreen({ s, onClose, say }: { s: StoreTarget; onClose: () => void; /** The shopkeeper says this aloud. */ say: (text: string) => void }) {
  const { data, error } = useLocal<StoreData>(queryOf(s));
  const deals = useDeals(s);
  const sections = useMemo<MenuSection[]>(() => {
    if (data?.menu?.sections.length) return data.menu.sections;
    // A shop with no menu: its products on Torob, as one shelf.
    const items = (data?.torob ?? []).filter((x) => x.price > 0).slice(0, 40).map((x, i) => ({ id: `tb${i}`, title: x.title, about: x.shop, price: x.price, priceNow: x.price, photo: x.photo }));
    return items.length ? [{ title: t("Products"), items }] : [];
  }, [data]);
  const week = data ? data.about.week ?? weekFromOsm(data.about.hours) ?? data.menu?.week ?? null : null;
  const [tab, setTab] = useState(0);
  const [basket, setBasket] = useState<Basket>(new Map());
  const [line, setLine] = useState<string>("");
  const [ask, setAsk] = useState<string>("");
  const lastSay = useRef(0);

  /** The shopkeeper answers (written in their bubble, spoken aloud). */
  const answer = (act: ShopAct, extra: { item?: ShopItem; basket?: { n: number; total: number } } = {}, asked = "") => {
    const l = shopSay(act, { store: data?.about.name || s.name, sections, week, at: new Date(), timeZone: zoneOf(s), num: fmtNum, ...extra });
    const text = t(l.key, l.params);
    setAsk(asked);
    setLine(text);
    // Not a voice per tap when someone fills a basket fast.
    if (performance.now() - lastSay.current > 900 || act !== "price") say(text), (lastSay.current = performance.now());
  };

  // Welcomed once the store's data is here (or couldn't be had).
  const welcomed = useRef(false);
  useEffect(() => {
    if (welcomed.current || (!data && !error)) return;
    welcomed.current = true;
    answer("welcome");
  }, [data, error]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape (or the phone's Back) leaves the shop.
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && leave();
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const n = [...basket.values()].reduce((a, x) => a + x.n, 0);
  const total = [...basket.values()].reduce((a, x) => a + x.n * (x.item.priceNow || x.item.price), 0);
  const add = (item: MenuSection["items"][number], d: number) => {
    setBasket((b) => {
      const next = new Map(b), had = next.get(item.id)?.n ?? 0, k = Math.max(0, had + d);
      if (k) next.set(item.id, { item, n: k });
      else next.delete(item.id);
      return next;
    });
    if (d > 0) answer("price", { item }, item.title);
  };
  const leave = () => {
    say(t(shopSay("bye", { store: s.name, sections, week, at: new Date(), num: fmtNum }).key));
    onClose();
  };
  const site = data?.menu ? data.menu.vendor.url || snappfoodMenuUrl(data.menu.vendor.code) : data?.links?.[0]?.url;
  const cover = data?.menu?.cover || data?.about.photo || deals[0]?.photos[0];
  const shelf = sections[Math.min(tab, Math.max(0, sections.length - 1))];
  const fa = getLocale() === "fa";

  return (
    <div className="shop" role="dialog" aria-modal="true" aria-label={t("Inside {store}", { store: s.name })} style={{ "--trade": s.color } as React.CSSProperties}>
      <header className="shop-top">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {cover && <img className="shop-cover" src={cover} alt="" referrerPolicy="no-referrer" onError={(e) => e.currentTarget.remove()} />}
        <button type="button" className="shop-leave" onClick={leave}>{fa ? "›" : "‹"} {t("Leave")}</button>
        <div className="shop-title">
          <b dir="auto">{s.emoji} {data?.about.name || s.name}</b>
          <span className="shop-meta">
            {!!data?.menu?.vendor.rating && <span>⭐ {fmtNum(data.menu.vendor.rating)}</span>}
            <OpenBadge week={week} at={s} />
          </span>
        </div>
      </header>

      <section className="shop-keeper" aria-live="polite">
        <span className="shop-face" aria-hidden>🧔‍♂️</span>
        <div className="shop-bubble">
          {ask && <small className="shop-asked" dir="auto">{ask}</small>}
          <p dir="auto">{line || (data || error ? "…" : t("The shopkeeper is looking up from the counter…"))}</p>
        </div>
      </section>
      <div className="shop-asks" role="group" aria-label={t("Ask the shopkeeper")}>
        {ASKS.map((a) => (
          <button key={a.act} type="button" onClick={() => answer(a.act, {}, t(a.label))}>
            <span aria-hidden>{a.emoji}</span> {t(a.label)}
          </button>
        ))}
      </div>

      {sections.length > 1 && (
        <nav className="shop-tabs" role="tablist" aria-label={t("Menu")}>
          {sections.map((sec, i) => (
            <button key={`${sec.title}${i}`} type="button" role="tab" aria-selected={i === tab} className={i === tab ? "on" : ""} onClick={() => setTab(i)} dir="auto">{sec.title}</button>
          ))}
        </nav>
      )}
      <main className="shop-shelf">
        {!data && !error && <div className="shop-wait" aria-busy="true">{[0, 1, 2, 3].map((i) => <i key={i} />)}</div>}
        {(data || error) && !sections.length && <p className="shop-empty">{t("No prices for this store yet — ask the shopkeeper, or look it up on its site.")}</p>}
        {shelf && (
          <ul className="shop-items">
            {shelf.items.map((it) => {
              const inB = basket.get(it.id)?.n ?? 0, off = it.priceNow && it.priceNow < it.price;
              return (
                <li key={it.id} className={inB ? "in" : ""}>
                  <button type="button" className="shop-item" onClick={() => add(it, 1)} aria-label={t("Add {item}", { item: it.title })}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {it.photo ? <img src={it.photo} alt="" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = "hidden")} /> : <span className="shop-ph" aria-hidden>{s.emoji}</span>}
                    <span className="shop-item-tx">
                      <b dir="auto">{it.title}</b>
                      {it.about && <small dir="auto">{it.about}</small>}
                      <span className="shop-price">
                        {off ? <s>{fmtNum(it.price)}</s> : null}
                        <b>{t("{n} toman", { n: fmtNum(it.priceNow || it.price) })}</b>
                      </span>
                    </span>
                  </button>
                  {inB > 0 && (
                    <span className="shop-qty">
                      <button type="button" onClick={() => add(it, -1)} aria-label={t("Less")}>−</button>
                      <output>{fmtNum(inB)}</output>
                      <button type="button" onClick={() => add(it, 1)} aria-label={t("More")}>+</button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </main>

      <footer className="shop-foot">
        <div className="grow">
          <b>{n ? t("{n} toman", { n: fmtNum(total) }) : t("Your basket is empty")}</b>
          {n > 0 && <small>{t("{n} things", { n: fmtNum(n) })}</small>}
        </div>
        {n > 0 && <button type="button" className="btn small ghost" onClick={() => answer("checkout", { basket: { n, total } }, t("How much is it all?"))}>{t("At the counter")}</button>}
        {site && (
          <a className="btn small yellow" href={site} target="_blank" rel="noreferrer noopener">
            {data?.menu ? t("Order on Snappfood") : t("Its site")} ↗
          </a>
        )}
      </footer>
    </div>
  );
}
