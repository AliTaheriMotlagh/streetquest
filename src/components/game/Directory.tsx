"use client";
// The store directories in the game (lib/stores/directory.ts, /api/stores):
//  - useDirectory: Bilbooard / Irangaah / Okala / Netbarg stores and Sheypoor's ads round the player
//    (or the explored spot), for the map layers the filter has on;
//  - DirStoreCard: one store — photos, hours, phones, the deal, Okala's reviews, its menu (Snappfood)
//    or catalog (Torob) when one matches, Basalam products of its kind, and its page on its site;
//  - AdAreaCard: a neighbourhood's newest Sheypoor ads;
//  - StoreDirectory: every store round you as a list, searchable, filtered by site and by type;
//  - ServicesSheet: home services (Achareh, Sanjagh, Khedmatazma) and the online shopping sites.
// Every link out goes through the leave page (LeaveGuard).
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { distanceM, formatDistance } from "@/lib/geo";
import {
  MAP_SITES, placeCatOf, SERVICES, serviceUrl, SITES, STORE_TYPE_KEYS, STORE_TYPES, siteLayer,
  type AdArea, type DirDetail, type DirStore, type MapSite, type Product, type SiteId, type StoreType,
} from "@/lib/stores/directory";
import { api, type LatLng } from "./client";
import { Sheet, useGame } from "./ui";
import { CallButton, GoButtons, InfoView, Pic, StoreExtras, StoreHead, StoreTabs } from "./StoreInfo";

/** Ask again this far from the last load, or after this long (a minute after a failure or a still-loading answer). */
const REFETCH_M = 600;
const REFRESH_MS = 15 * 60_000;

// ---------------------------------------------------------------- loading
type Around = { stores: DirStore[]; ads: AdArea[]; city: string | null; pending: boolean };
/** The directory stores and Sheypoor ads round `look`, for the site layers that are on. */
export function useDirectory(on: (layer: string) => boolean, look: LatLng | null, now: number) {
  const sites = MAP_SITES.filter((s) => on(siteLayer(s)));
  const ads = on(siteLayer("sheypoor"));
  const key = `${sites.join(",")}|${ads ? 1 : 0}`;
  const [data, setData] = useState<Around>({ stores: [], ads: [], city: null, pending: false });
  const last = useRef<{ pos: LatLng; at: number; ok: boolean; key: string } | null>(null);
  useEffect(() => {
    if (!look || (!sites.length && !ads)) return;
    const l = last.current;
    if (l && l.key === key && distanceM(l.pos, look) < REFETCH_M && Date.now() - l.at < (l.ok ? REFRESH_MS : 60_000)) return;
    const tried = (last.current = { pos: look, at: Date.now(), ok: false as boolean, key });
    api<Around>(`/api/stores?near=1&lat=${look.lat.toFixed(4)}&lng=${look.lng.toFixed(4)}&sites=${sites.join(",")}&ads=${ads ? 1 : 0}`)
      .then((r) => {
        tried.ok = !r.pending;
        setData(r);
      })
      .catch(() => {});
  }, [key, look, now]); // eslint-disable-line react-hooks/exhaustive-deps
  return data;
}

/** /api/stores with these params; null while loading. */
function useStores<T>(params: Record<string, string | number | undefined> | null) {
  const qs = params ? new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== "").map(([k, v]) => [k, String(v)])).toString() : null;
  const [state, setState] = useState<{ qs: string | null; data: T | null; error: string | null }>({ qs: null, data: null, error: null });
  useEffect(() => {
    if (!qs) return;
    let live = true;
    api<T>(`/api/stores?${qs}`)
      .then((data) => live && setState({ qs, data, error: null }))
      .catch((e) => live && setState({ qs, data: null, error: (e as Error).message }));
    return () => void (live = false);
  }, [qs]);
  return state.qs === qs ? state : { qs, data: null, error: null };
}

// ---------------------------------------------------------------- bits
export function SiteChip({ site, small }: { site: SiteId; small?: boolean }) {
  const s = SITES[site];
  return (
    <span className={`site-chip${small ? " sm" : ""}`} style={{ "--site": s.color } as React.CSSProperties}>
      <span aria-hidden>{s.emoji}</span> {t(s.name)}
    </span>
  );
}
const stars = (r: number) => (r > 0 ? `⭐ ${fmtNum(r)}` : "");
const toman = (n: number) => t("{n} toman", { n: fmtNum(n) });

function Photos({ urls }: { urls: string[] }) {
  if (!urls.length) return null;
  return (
    <div className="dir-photos" role="list">
      {urls.map((u) => (
        <div role="listitem" key={u} className="dir-photo">
          <Pic src={u} />
        </div>
      ))}
    </div>
  );
}

function About({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  const long = text.length > 220;
  return (
    <p className={`dir-about small${open || !long ? "" : " clamp"}`} dir="auto">
      {text}
      {long && (
        <button className="link-btn" onClick={() => setOpen(!open)}>
          {open ? t("Less") : t("More")}
        </button>
      )}
    </p>
  );
}

// ---------------------------------------------------------------- Basalam
function ProductList({ items }: { items: Product[] }) {
  return (
    <div className="ext-items compact">
      {items.map((p) => (
        <a key={p.id} className="ext-item link" href={p.url} target="_blank" rel="noopener noreferrer">
          {p.img ? <img src={p.img} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ext-ph">🧺</span>}
          <div className="grow">
            <b dir="auto" className="clamp2">{p.name}</b>
            <p className="small muted" dir="auto">{[p.seller, p.city, p.rating ? `${stars(p.rating)} (${fmtNum(p.votes)})` : ""].filter(Boolean).join(" · ")}</p>
          </div>
          <span className="price-tag"><b>{toman(p.price)}</b></span>
        </a>
      ))}
    </div>
  );
}
/** Basalam's sellers for a product (the player's city first); `initial` is what it searches before anything is typed. */
export function BasalamSearch({ initial, city }: { initial: string; city?: string | null }) {
  const [q, setQ] = useState(initial);
  const [ask, setAsk] = useState(initial);
  const { data, error } = useStores<{ products: Product[] }>(ask.trim().length >= 2 ? { basalam: ask.trim(), city: city ?? undefined } : null);
  return (
    <div className="dir-basalam">
      <form className="row" onSubmit={(e) => (e.preventDefault(), setAsk(q))}>
        <input className="grow" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search Basalam…")} aria-label={t("Search Basalam…")} dir="auto" />
        <button className="btn small" type="submit">🔎</button>
      </form>
      {error ? <p className="small warn-text">{error}</p> : !data ? <p className="small muted">{t("Loading…")}</p> : data.products.length ? <ProductList items={data.products} /> : <p className="small muted">{t("Nothing found on Basalam")}</p>}
    </div>
  );
}

// ---------------------------------------------------------------- one store
/** Search words for a store type on Basalam (the type's own name, in Persian). */
const BASALAM_QUERY: Partial<Record<StoreType, string>> = {
  grocery: "خوراکی", bakery: "نان", fruit: "میوه خشک", butcher: "گوشت", sweets: "شیرینی", cafe: "قهوه", clothing: "لباس", beauty: "آرایشی",
  home: "دکوری", building: "ابزار", digital: "لوازم جانبی موبایل", sport: "ورزشی", food: "ادویه",
};

export function DirStoreCard({ s, onClose }: { s: DirStore; onClose: () => void }) {
  const { pos } = useGame();
  const here = pos ?? s;
  const dist = pos ? distanceM(pos, s) : Infinity;
  const { data, error } = useStores<{ detail: DirDetail | null }>({ detail: s.id, url: s.url, lat: s.lat.toFixed(6), lng: s.lng.toFixed(6) });
  const d = data?.detail ?? null;
  const type = STORE_TYPES[s.type];
  const site = SITES[s.site];
  const sub = [t(type.label), s.cat && s.cat !== t(type.label) ? s.cat : "", Number.isFinite(dist) ? formatDistance(dist) : ""].filter(Boolean).join(" · ");
  const photos = d?.photos.length ? d.photos : s.img ? [s.img] : [];
  const store = { name: s.name, lat: s.lat, lng: s.lng };
  const phones = d?.phones.length ? d.phones : s.phone ? [{ number: s.phone, source: s.site === "irangaah" ? ("irangaah" as const) : ("map" as const) }] : undefined;
  const bq = BASALAM_QUERY[s.type];
  const tabs = [
    { key: "info", label: `ℹ️ ${t("Info")}`, body: () => <InfoView at={s} store={store} week={d?.week} address={d?.address} phones={phones} minOrder={d?.minOrder} /> },
    // The menu (Snappfood) or catalog (Torob) of the same store, and its links on the other sites.
    { key: "menu", label: `🍽️ ${t("Menu & prices")}`, body: () => <StoreExtras query={{ store: "place", name: s.name, lat: s.lat.toFixed(6), lng: s.lng.toFixed(6), cat: placeCatOf(s.type) }} at={s} bare /> },
    ...(d?.reviews?.length
      ? [{
          key: "reviews",
          label: `💬 ${t("Reviews")} (${fmtNum(d.reviews.length)})`,
          body: () => (
            <div className="dir-reviews">
              {d.reviews!.map((r, i) => (
                <div key={i} className="dir-review">
                  <div className="row small"><b dir="auto">{r.name || t("Customer")}</b><span className="muted">{"⭐".repeat(Math.max(0, Math.min(5, Math.round(r.rate))))}</span></div>
                  <p className="small" dir="auto">{r.text}</p>
                </div>
              ))}
            </div>
          ),
        }]
      : []),
    ...(bq ? [{ key: "basalam", label: `🧺 ${t("On Basalam")}`, body: () => <BasalamSearch initial={bq} /> }] : []),
  ];
  return (
    <Sheet title={`${type.emoji} ${s.name}`} onClose={onClose} tall>
      <StoreHead logo={s.site === "okala" ? s.img : undefined} emoji={type.emoji} name={s.name} sub={sub} rating={d?.rating || s.rating || undefined} reviews={d?.ratingCount || undefined} week={d?.week} at={here} />
      <div className="dir-sites">
        <SiteChip site={s.site} />
        {(s.also ?? []).map((a) => <SiteChip key={a} site={a} small />)}
      </div>
      <Photos urls={photos} />
      {d?.offer && (
        <div className={`dir-deal${d.offer.available ? "" : " ended"}`}>
          <div className="grow">
            <b dir="auto">{d.offer.title}</b>
            <div className="small">
              {d.offer.off > 0 && <span className="deal-tag">−{fmtNum(d.offer.off)}%</span>} <b>{toman(d.offer.price)}</b>
              {d.offer.was > d.offer.price && <s className="muted"> {toman(d.offer.was)}</s>}
            </div>
            {!d.offer.available && <div className="small muted">{t("This deal has ended — the store may have a new one on {site}.", { site: t(site.name) })}</div>}
          </div>
        </div>
      )}
      {d?.eta && <p className="small dir-eta">🛵 {t("Delivers in {eta}", { eta: d.eta })}</p>}
      <About text={d?.description ?? ""} />
      <div className="store-actions">
        <a className={`btn small ext-link ext-dir ext-${s.site}`} href={s.url} target="_blank" rel="noopener noreferrer" style={{ "--site": site.color } as React.CSSProperties}>
          {site.emoji} {s.site === "okala" ? t("Order on {site}", { site: t(site.name) }) : s.site === "netbarg" && s.off != null ? t("Buy on {site}", { site: t(site.name) }) : t("Open on {site}", { site: t(site.name) })}
        </a>
        {data && <CallButton store={store} phones={phones} />}
        <GoButtons to={s} name={s.name} dist={dist} />
      </div>
      {error && <p className="small warn-text">{error}</p>}
      {!data && !error && <p className="small muted ext-loading">⏳ {t("Loading the store's page…")}</p>}
      <StoreTabs tabs={tabs} />
      <p className="small muted ext-source">{t("From {site}", { site: t(site.name) })}</p>
    </Sheet>
  );
}

// ---------------------------------------------------------------- Sheypoor
export function AdAreaCard({ area, onClose }: { area: AdArea; onClose: () => void }) {
  return (
    <Sheet title={`📣 ${t("Sheypoor · {area}", { area: area.name })}`} onClose={onClose} tall>
      <p className="small muted">{t("The newest ads people posted in {area}.", { area: area.name })}</p>
      <div className="ext-items compact">
        {area.ads.map((a) => (
          <a key={a.id} className="ext-item link" href={a.url} target="_blank" rel="noopener noreferrer">
            {a.img ? <img src={a.img} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <span className="ext-ph">📣</span>}
            <div className="grow">
              <b dir="auto">{a.title}</b>
              <p className="small muted" dir="auto">{[a.cat, a.ago].filter(Boolean).join(" · ")}</p>
            </div>
            {a.price && <span className="price-tag" dir="auto"><b>{a.price}</b></span>}
          </a>
        ))}
      </div>
      <a className="btn small ghost ext-link ext-sheypoor block" href={SITES.sheypoor.url} target="_blank" rel="noopener noreferrer">📣 {t("More on Sheypoor")}</a>
      <p className="small muted ext-source">{t("From Sheypoor · updated every 15 minutes")}</p>
    </Sheet>
  );
}

// ---------------------------------------------------------------- the list
type Sort = "near" | "rating" | "name";
const PAGE = 60;
/** Every directory store round you, as a list: search, by site, by type, nearest / best rated first. */
export function StoreDirectory({ stores, at, onPick, onClose, onServices, onProducts }: { stores: DirStore[]; at: LatLng | null; onPick: (s: DirStore) => void; onClose: () => void; onServices: () => void; /** Search what the stores sell instead (ProductSearch). */ onProducts?: () => void }) {
  const [q, setQ] = useState("");
  const [sites, setSites] = useState<MapSite[]>([]);
  const [types, setTypes] = useState<StoreType[]>([]);
  const [sort, setSort] = useState<Sort>("near");
  const [shown, setShown] = useState(PAGE);
  const withDist = useMemo(() => stores.map((s) => ({ s, m: at ? distanceM(at, s) : 0 })), [stores, at]);
  // Typing never waits for the list: the box updates at once, the (long) list a moment later,
  // and each store's searchable text is built once, not three times a key.
  const dq = useDeferredValue(q);
  const hay = useMemo(() => new Map(stores.map((s) => [s.id, `${s.name} ${s.cat} ${t(STORE_TYPES[s.type].label)}`.toLowerCase()])), [stores]);
  const words = dq.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const match = (s: DirStore) => !words.length || words.every((w) => (hay.get(s.id) ?? "").includes(w));
  // Counts for each chip: what the other filters leave.
  const bySite = (s: DirStore) => !sites.length || sites.includes(s.site) || (s.also ?? []).some((a) => sites.includes(a));
  const byType = (s: DirStore) => !types.length || types.includes(s.type);
  const siteN = useMemo(() => {
    const n = new Map<MapSite, number>();
    for (const { s } of withDist) if (match(s) && byType(s)) for (const x of [s.site, ...(s.also ?? [])]) n.set(x, (n.get(x) ?? 0) + 1);
    return n;
  }, [withDist, dq, types]); // eslint-disable-line react-hooks/exhaustive-deps
  const typeN = useMemo(() => {
    const n = new Map<StoreType, number>();
    for (const { s } of withDist) if (match(s) && bySite(s)) n.set(s.type, (n.get(s.type) ?? 0) + 1);
    return n;
  }, [withDist, dq, sites]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = useMemo(() => {
    const l = withDist.filter(({ s }) => match(s) && bySite(s) && byType(s));
    l.sort((a, b) => (sort === "near" ? a.m - b.m : sort === "rating" ? b.s.rating - a.s.rating || a.m - b.m : a.s.name.localeCompare(b.s.name, "fa")));
    return l;
  }, [withDist, dq, sites, types, sort]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setShown(PAGE), [dq, sites, types, sort]);
  const flip = <T,>(list: T[], x: T) => (list.includes(x) ? list.filter((y) => y !== x) : [...list, x]);
  return (
    <Sheet title={`🗂️ ${t("All stores around you")}`} onClose={onClose} tall>
      <input className="dir-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Search stores, doctors, services…")} aria-label={t("Search stores, doctors, services…")} dir="auto" />
      {onProducts && (
        <button className="btn small cyan dir-products" onClick={onProducts}>
          🔎 {t("Find a product")} <span className="small">· {t("prices in every store")}</span>
        </button>
      )}
      <div className="filter-chips dir-chips" aria-label={t("Sites")}>
        {MAP_SITES.map((s) => (
          <button key={s} className={`filter-chip ${sites.includes(s) ? "on" : ""}`} aria-pressed={sites.includes(s)} onClick={() => setSites(flip(sites, s))} style={{ "--site": SITES[s].color } as React.CSSProperties}>
            <span aria-hidden>{SITES[s].emoji}</span>
            <span className="lb">{t(SITES[s].name)}</span>
            <span className="n">{fmtNum(siteN.get(s) ?? 0)}</span>
          </button>
        ))}
      </div>
      <div className="filter-chips kinds dir-chips" aria-label={t("Store types")}>
        {STORE_TYPE_KEYS.filter((k) => typeN.get(k) || types.includes(k)).map((k) => (
          <button key={k} className={`filter-chip ${types.includes(k) ? "on" : ""}`} aria-pressed={types.includes(k)} onClick={() => setTypes(flip(types, k))}>
            <span aria-hidden>{STORE_TYPES[k].emoji}</span>
            <span className="lb">{t(STORE_TYPES[k].label)}</span>
            <span className="n">{fmtNum(typeN.get(k) ?? 0)}</span>
          </button>
        ))}
      </div>
      <div className="row dir-sort">
        <span className="small muted grow">{t("{n} stores", { n: fmtNum(list.length) })}</span>
        {(["near", "rating", "name"] as Sort[]).map((k) => (
          <button key={k} className={`btn tiny ghost ${sort === k ? "on" : ""}`} aria-pressed={sort === k} onClick={() => setSort(k)}>
            {k === "near" ? `📍 ${t("Nearest")}` : k === "rating" ? `⭐ ${t("Best rated")}` : `🔤 ${t("A–Z")}`}
          </button>
        ))}
        {(sites.length > 0 || types.length > 0 || q) && (
          <button className="btn tiny ghost" onClick={() => (setSites([]), setTypes([]), setQ(""))}>✕ {t("Clear")}</button>
        )}
      </div>
      {!stores.length ? (
        <p className="small muted">{t("Loading the stores around you… turn on a store site in the map filter if this stays empty.")}</p>
      ) : !list.length ? (
        <p className="small muted">{t("No store matches — try fewer filters.")}</p>
      ) : (
        <ul className="dir-list">
          {list.slice(0, shown).map(({ s, m }) => (
            <li key={s.id}>
              <button className="dir-row" onClick={() => onPick(s)}>
                {s.img ? <Pic src={s.img} className="dir-thumb" /> : <span className="dir-thumb ph" style={{ background: STORE_TYPES[s.type].color }}>{STORE_TYPES[s.type].emoji}</span>}
                <span className="grow">
                  <b dir="auto">{s.name}</b>
                  <span className="small muted" dir="auto">{[t(STORE_TYPES[s.type].label), s.cat, at ? formatDistance(m) : ""].filter(Boolean).join(" · ")}</span>
                  <span className="dir-row-tags">
                    <SiteChip site={s.site} small />
                    {s.rating > 0 && <span className="tag">{stars(s.rating)}</span>}
                    {!!s.off && <span className="deal-tag">−{fmtNum(s.off)}%</span>}
                    {s.phone && <span className="tag">📞</span>}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {list.length > shown && <button className="btn small ghost block" onClick={() => setShown(shown + PAGE)}>{t("Show more")} ({fmtNum(list.length - shown)})</button>}
      <button className="btn small cyan block" onClick={onServices}>🛠️ {t("Home services & shopping sites")}</button>
    </Sheet>
  );
}

// ---------------------------------------------------------------- services & shopping sites
const SERVICE_SITES = ["achareh", "sanjagh", "khedmatazma"] as const;
const SHOPPING: SiteId[] = ["basalam", "okala", "emalls", "snappshop", "netbarg", "sheypoor", "bilbooard", "irangaah"];
export function ServicesSheet({ at, onClose }: { at: LatLng | null; onClose: () => void }) {
  const { data } = useStores<{ city: string | null }>(at ? { city: "1", lat: at.lat.toFixed(3), lng: at.lng.toFixed(3) } : null);
  const city = data?.city ?? null;
  return (
    <Sheet title={`🛠️ ${t("Home services & shopping sites")}`} onClose={onClose} tall>
      <h4 className="small muted">{t("Book a pro")}</h4>
      <div className="svc-grid">
        {SERVICES.map((c) => (
          <div key={c.key} className="svc-card">
            <b><span aria-hidden>{c.emoji}</span> {t(c.label)}</b>
            <div className="svc-links">
              {SERVICE_SITES.filter((s) => c.links[s]).map((s) => (
                <a key={s} className="site-chip link" href={serviceUrl(s, c.links[s]!, city)} target="_blank" rel="noopener noreferrer" style={{ "--site": SITES[s].color } as React.CSSProperties}>
                  {SITES[s].emoji} {t(SITES[s].name)}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
      <h4 className="small muted">{t("Shop online")}</h4>
      <div className="svc-sites">
        {SHOPPING.map((id) => {
          const s = SITES[id];
          return (
            <a key={id} className="svc-site" href={s.url} target="_blank" rel="noopener noreferrer" style={{ "--site": s.color } as React.CSSProperties}>
              <span className="svc-ico" aria-hidden>{s.emoji}</span>
              <span className="grow">
                <b>{t(s.name)}</b>
                <span className="small muted">{t(s.what)}</span>
              </span>
            </a>
          );
        })}
      </div>
      <p className="small muted">{t("Prices and bookings are on each site; the game only shows you the way.")}</p>
    </Sheet>
  );
}

