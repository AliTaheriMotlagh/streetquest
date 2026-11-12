"use client";
// The Places tab of the 3D city's menu: every store you can look up from the driver's seat.
//  - what's on the streets drawn round you (rows from Drive's syncPlaces), nearest first;
//  - a search that reaches the whole district (/api/explore?q, lib/explore searchPlaces) — or
//    another city — so a store needn't be near to be found;
//  - kinds as chips (food, cafés, pharmacies…) to browse without typing;
//  - a tap on a row opens the store's card (menu, prices, reviews, hours) without driving
//    there; the compass sets the route.
// It keeps its own state: typing here re-renders this list only, never the 3D city's HUD
// (the search box used to live in Drive, and every key re-rendered all of it).
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { distanceM, formatDistance, type LatLng } from "@/lib/geo";
import { EXPLORE_PLACES, SEARCH_RADIUS_M, type PlaceHit } from "@/lib/explore";
import { normName } from "@/lib/localData";
import { PLACE_CATS, type PlaceCat } from "@/lib/places";
import { iconForEmoji } from "@/lib/hudMarkers";
import { api, type Selected } from "../game/client";
import { Icon } from "./icons";

export type PlaceRow = {
  id: string;
  emoji: string;
  name: string;
  sub: string;
  dist: number;
  lat: number;
  lng: number;
  /** A player's shop or a business: it has its own card. */
  sel: Selected | null;
  /** The map's class of a shop drawn in the city (its trade), or its kind when it came from a search. */
  cls?: string;
  cat?: PlaceCat;
  color?: string;
};

/** The kinds you can browse by, each a few place categories. */
const KINDS: { key: string; cats: PlaceCat[] }[] = [
  { key: "restaurant", cats: ["restaurant", "burger", "pizza"] },
  { key: "cafe", cats: ["cafe", "icecream", "bar"] },
  { key: "bakery", cats: ["bakery"] },
  { key: "grocery", cats: ["grocery"] },
  { key: "pharmacy", cats: ["pharmacy"] },
  { key: "fuel", cats: ["fuel"] },
  { key: "bank", cats: ["bank"] },
  { key: "fashion", cats: ["fashion"] },
  { key: "tech", cats: ["tech"] },
  { key: "cinema", cats: ["cinema"] },
];
/** Typing waits this long before it asks the server (ms). */
const TYPE_WAIT_MS = 280;

type Props = {
  /** The stores on the streets drawn so far, already narrowed to what `onQuery` was given. */
  rows: PlaceRow[];
  /** Where I am now (null before the city has a position). */
  here: () => LatLng | null;
  /** Narrow `rows` to these words. */
  onQuery: (q: string) => void;
  /** Show a store's card (menu, prices, hours). */
  onOpen: (p: PlaceRow) => void;
  /** Set the route to it. */
  onGo: (p: PlaceRow) => void;
  onSelect: (s: Selected) => void;
  /** Open the 2D map. */
  onMap: () => void;
  /** Search what the stores sell, by price (game/ProductSearch). */
  onProducts: () => void;
};

const rowOf = (h: PlaceHit): PlaceRow => {
  const c = PLACE_CATS[h.cat];
  return { id: `x:${h.id}`, emoji: c.emoji, name: h.name, sub: t(c.label), dist: h.dist, lat: h.lat, lng: h.lng, sel: null, cat: h.cat, color: c.color };
};

export const DrivePlaces = memo(function DrivePlaces({ rows, here, onQuery, onOpen, onGo, onSelect, onMap, onProducts }: Props) {
  const [draft, setDraft] = useState("");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<string | null>(null);
  /** Searching round another city instead of round me. */
  const [city, setCity] = useState<string>("");
  const [found, setFound] = useState<{ key: string; rows: PlaceRow[] } | null>(null);
  const [failed, setFailed] = useState(false);
  const cb = useRef({ here, onQuery });
  cb.current = { here, onQuery };

  // The words settle a moment after the last key (one question to the server per pause, not per letter).
  useEffect(() => {
    const id = setTimeout(() => setQ(draft.trim()), TYPE_WAIT_MS);
    return () => clearTimeout(id);
  }, [draft]);
  useEffect(() => cb.current.onQuery(q), [q]);
  // Closing the tab leaves the city's own list unfiltered.
  useEffect(() => () => cb.current.onQuery(""), []);

  const cats = kind ? KINDS.find((k) => k.key === kind)!.cats : null;
  const away = EXPLORE_PLACES.find((p) => p.id === city) ?? null;
  const asking = q.length >= 2 || !!cats;
  const key = asking ? `${q}|${kind ?? ""}|${city}` : "";
  useEffect(() => {
    if (!key) return;
    const at = away ?? cb.current.here();
    if (!at) return;
    let live = true;
    setFailed(false);
    api<{ results: PlaceHit[] }>(`/api/explore?q=${encodeURIComponent(q)}&lat=${at.lat.toFixed(5)}&lng=${at.lng.toFixed(5)}${cats ? `&cats=${cats.join(",")}` : ""}`)
      .then((r) => {
        if (!live) return;
        // Measured from me, even when the search is round another city.
        const me = cb.current.here();
        setFound({ key, rows: r.results.map((h) => rowOf(me && away ? { ...h, dist: Math.round(distanceM(me, h)) } : h)) });
      })
      .catch(() => live && (setFailed(true), setFound({ key, rows: [] })));
    return () => void (live = false);
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  /** What's listed: the streets round me (unless a kind or another city narrows it), then what the search found beyond them — each store once. */
  const list = useMemo(() => {
    const near = cats || away ? [] : rows;
    if (!asking || found?.key !== key) return near;
    const seen = near.map((r) => ({ n: normName(r.name), r }));
    const more = found.rows.filter((f) => {
      const n = normName(f.name);
      return !seen.some((s) => s.n === n && distanceM(s.r, f) < 80);
    });
    return [...near, ...more];
  }, [rows, found, key, asking, cats, away]);
  const loading = asking && found?.key !== key;

  return (
    <div className="drive-tab dplaces">
      <button className="pm-row" onClick={onMap}>
        <Icon name="map" size={20} />
        <span className="grow">{t("Open the map")}</span>
        <Icon name="external" size={16} />
      </button>
      <button className="pm-row dp-products" onClick={onProducts}>
        <Icon name="search" size={20} />
        <span className="grow">{t("Find a product")} <span className="small muted">· {t("prices in every store")}</span></span>
        <Icon name="tag" size={16} />
      </button>
      <div className="dp-find">
        <input className="drive-search" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("Search shops, banks, cafés…")} aria-label={t("Search places")} dir="auto" maxLength={60} enterKeyHint="search" />
        <select className="dp-city" value={city} onChange={(e) => setCity(e.target.value)} aria-label={t("Search around")}>
          <option value="">{t("Around me")}</option>
          {EXPLORE_PLACES.map((p) => (
            <option key={p.id} value={p.id}>{t(p.name)}</option>
          ))}
        </select>
      </div>
      <div className="dp-chips" role="group" aria-label={t("Kinds of places")}>
        {KINDS.map((k) => {
          const c = PLACE_CATS[k.cats[0]];
          return (
            <button key={k.key} className={`dp-chip ${kind === k.key ? "on" : ""}`} aria-pressed={kind === k.key} onClick={() => setKind(kind === k.key ? null : k.key)}>
              <span aria-hidden>{c.emoji}</span>
              {t(c.label)}
            </button>
          );
        })}
      </div>
      <p className="small muted dp-note" aria-live="polite">
        {loading
          ? t("Searching…")
          : failed
            ? t("Couldn't search right now — showing what's on the streets around you.")
            : away && !asking
              ? t("Type a name or pick a kind to look around {place}.", { place: t(away.name) })
              : list.length === 0
                ? asking || draft.trim()
                  ? t("Nothing called “{q}” around here.", { q: draft.trim() || t(PLACE_CATS[cats?.[0] ?? "shop"].label) })
                  : t("No places found around here yet — drive on and the map fills in.")
                : asking
                  ? t("{n} places within {d}", { n: fmtNum(list.length), d: formatDistance(SEARCH_RADIUS_M) })
                  : t("{n} places on the streets around you — search to look further", { n: fmtNum(list.length) })}
      </p>
      {list.map((p) => (
        <div key={p.id} className="drive-job drive-place">
          <button className="drive-place-go" onClick={() => (p.sel ? onSelect(p.sel) : onOpen(p))} aria-label={t("Open {name}", { name: p.name })}>
            <span className="ic"><Icon name={iconForEmoji(p.emoji)} size={20} /></span>
            <span className="grow">
              <b dir="auto">{p.name}</b>
              <span className="small muted">{p.sub}</span>
            </span>
            <span className="small muted">{formatDistance(p.dist)}</span>
          </button>
          <button className="dp-go" onClick={() => onGo(p)} aria-label={t("Route to {name}", { name: p.name })} data-tip={t("Go there")}>
            <Icon name="nav" size={18} />
          </button>
        </div>
      ))}
    </div>
  );
});
