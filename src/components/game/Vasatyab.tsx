"use client";
// Vasatyab (وسط‌یاب): the party finds the meeting point in the middle of everyone.
//  - useVasatyab: the point, each member's distance and a few places near it (polled while open);
//  - VasatyabPanel: the list (members, places, set as gather point, share) — used by the 2D map's
//    dock below and by the 3D city's Play together tab (drive/PlayTogether.tsx);
//  - VasatyabDock: the 2D map's button + panel (only while you're in a party);
//  - VasatyabLayer: the point, the members and the lines between them on the 2D map.
// The maths is lib/midpoint.ts; the server side server/midpoint.ts (/api/party/midpoint).
import { useCallback, useEffect, useState } from "react";
import { Marker, Polyline } from "react-leaflet";
import { formatDistance, type LatLng } from "@/lib/geo";
import { msg, t } from "@/lib/i18n";
import type { MidMethod } from "@/lib/midpoint";
import { siktirCountLabel } from "@/lib/siktir";
import type { MidView } from "@/server/midpoint";
import { Button } from "@/components/Button";
import { api } from "./client";
import { esc, icon } from "./mapIcons";
import { useGame } from "./ui";

const METHODS: { key: MidMethod; label: string; hint: string }[] = [
  { key: "median", label: msg("Balanced"), hint: msg("The least driving for everyone put together") },
  { key: "fairest", label: msg("Fairest"), hint: msg("The farthest friend travels the least") },
  { key: "centroid", label: msg("Plain centre"), hint: msg("The average of where everyone is") },
];

const METHOD_KEY = "sq_vasatyab_method";
const savedMethod = (): MidMethod => {
  try {
    const m = localStorage.getItem(METHOD_KEY);
    return m === "fairest" || m === "centroid" ? m : "median";
  } catch {
    return "median";
  }
};

/** Poll the party's midpoint: every 4 s while `open` (with places), every 20 s otherwise (just the point, to know the party is there). */
export function useVasatyab(open: boolean) {
  const [method, setMethodState] = useState<MidMethod>("median");
  const [view, setView] = useState<MidView | null>(null);
  const [inParty, setInParty] = useState(true);
  useEffect(() => setMethodState(savedMethod()), []);
  const setMethod = (m: MidMethod) => {
    setMethodState(m);
    try {
      localStorage.setItem(METHOD_KEY, m);
    } catch {}
  };
  const load = useCallback(
    () =>
      api<MidView | { none: true }>(`/api/party/midpoint?method=${method}${open ? "" : "&lite=1"}`)
        .then((v) => ("none" in v ? (setInParty(false), setView(null)) : (setView(v), setInParty(true))))
        .catch(() => {}), // keep what's on screen
    [method, open],
  );
  useEffect(() => {
    void load();
    const i = setInterval(load, open ? 4000 : 20_000);
    return () => clearInterval(i);
  }, [load, open]);
  return { view, method, setMethod, inParty, reload: load };
}

const mapsUrl = (p: LatLng) => `https://www.google.com/maps?q=${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

type PanelProps = {
  view: MidView | null;
  method: MidMethod;
  setMethod: (m: MidMethod) => void;
  reload: () => void;
  /** 3D city: put my car at the meeting point (the server moves it; this moves the camera). */
  onTeleport?: (at: LatLng & { yaw: number }) => void;
  /** 3D city: drive there. */
  onGo?: (p: LatLng, label: string) => void;
  sim?: boolean;
  canDrive?: boolean;
};

export function VasatyabPanel({ view, method, setMethod, reload, onTeleport, onGo, sim, canDrive }: PanelProps) {
  const { toast, teleport, navigate } = useGame();
  const [busy, setBusy] = useState(false);
  const run = async (body: Record<string, unknown>, ok?: string) => {
    if (busy) return null;
    setBusy(true);
    try {
      const r = await api<{ at?: (LatLng & { yaw: number }) | null }>("/api/party/midpoint", { body });
      if (ok) toast({ kind: "social", title: ok });
      reload();
      return r;
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
      return null;
    } finally {
      setBusy(false);
    }
  };
  const share = async (p: LatLng, name: string) => {
    const text = name ? t("Let's meet at {place} — {url}", { place: name, url: mapsUrl(p) }) : t("Let's meet here — {url}", { url: mapsUrl(p) });
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        toast({ title: t("Link copied") });
      }
    } catch {}
  };
  const gatherHere = async () => {
    const r = await run({ action: "gather", sim });
    if (r?.at) {
      onTeleport?.(r.at);
      toast({ kind: "social", title: t("🚀 You're at the meeting point") });
    }
  };
  if (!view) return <p className="small muted">{t("Finding the middle…")}</p>;
  const located = view.members.filter((m) => m.lat != null);
  const meet = view.meet;
  return (
    <div className="vasa">
      <div className="vasa-methods" role="radiogroup" aria-label={t("How to pick the middle")}>
        {METHODS.map((m) => (
          <button key={m.key} role="radio" aria-checked={method === m.key} className={`filter-chip ${method === m.key ? "on" : ""}`} title={t(m.hint)} onClick={() => setMethod(m.key)}>
            <span className="lb">{t(m.label)}</span>
          </button>
        ))}
      </div>
      <p className="small muted">{t(METHODS.find((m) => m.key === method)!.hint)}</p>

      {meet && (
        <div className="vasa-meet">
          <b>📍 {meet.name ? t("Gather point: {name}", { name: meet.name }) : t("Gather point")}</b>
          <div className="row wrap">
            {teleport ? (
              <Button className="btn small yellow" onClick={() => teleport(meet)}>{t("Go there")}</Button>
            ) : navigate ? (
              <Button className="btn small cyan" onClick={() => navigate({ lat: meet.lat, lng: meet.lng, name: meet.name || undefined })}>🧭 {t("Route")}</Button>
            ) : null}
            {onTeleport && <Button className="btn small green" disabled={busy || !canDrive} onClick={gatherHere}>🚀 {t("Gather here")}</Button>}
            {onGo && <Button className="btn small cyan" onClick={() => onGo(meet, meet.name || t("Gather point"))}>🚗 {t("Drive there")}</Button>}
            <Button className="btn small ghost" onClick={() => share(meet, meet.name)}>{t("Share")}</Button>
            <Button className="btn small ghost" disabled={busy} onClick={() => run({ action: "clear" })}>{t("Clear")}</Button>
          </div>
        </div>
      )}

      {!view.point ? (
        <p className="small muted">{t("Waiting for your friends' positions — the middle shows up as soon as someone is on the map.")}</p>
      ) : (
        <>
          <p className="vasa-sum">
            {located.length < 2 ? t("Only you are on the map so far.") : t("Farthest travels {max} · {n} in the middle", { max: formatDistance(view.maxM), n: located.length })}
          </p>
          {view.members.map((m) => (
            <div key={m.userId} className="drive-job vasa-member">
              <span className="ic">{m.avatar}</span>
              <span className="grow">
                {m.name}
                {m.me ? ` · ${t("you")}` : ""}
                {m.stale && <span className="small muted"> · {t("last seen a while ago")}</span>}
              </span>
              <span className="small">{m.distM != null ? formatDistance(m.distM) : t("no position")}</span>
            </div>
          ))}
          <div className="row wrap">
            <Button className="btn small yellow" disabled={busy} onClick={() => run({ action: "set", lat: view.point!.lat, lng: view.point!.lng }, t("Gather point set"))}>
              📍 {t("Set as gather point")}
            </Button>
            <Button className="btn small ghost" onClick={() => share(view.point!, "")}>{t("Share")}</Button>
          </div>
          {!!view.places.length && <b className="small">{t("Places to meet near the middle")}</b>}
          {view.places.map((p) => (
            <div key={`${p.source}${p.id}`} className="drive-job vasa-place">
              <span className="ic">{p.emoji}</span>
              <span className="grow">
                <span dir="auto">{p.name}</span>
                <span className="small muted"> · {t("{d} from the middle", { d: formatDistance(p.fromM) })}</span>
                {p.siktir > 0 && <span className="small siktir-warn"> · {siktirCountLabel(p.siktir)}</span>}
              </span>
              <Button className="btn small" disabled={busy} onClick={() => run({ action: "set", lat: p.lat, lng: p.lng, name: p.name }, t("Gather point set"))}>{t("Meet here")}</Button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

/** The 2D map's Vasatyab button (only while you're in a party) and its panel. */
export function VasatyabDock({ onView }: { onView: (v: MidView | null) => void }) {
  const [open, setOpen] = useState(false);
  const v = useVasatyab(open);
  // The map draws the point while the panel is open, and the gather point whenever there is one.
  useEffect(() => onView(v.inParty && v.view && (open || v.view.meet) ? v.view : null), [v.view, open, v.inParty]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!v.inParty) return null;
  return (
    <>
      <Button className={`fab vasa-fab ${open ? "on" : ""}`} title={t("Vasatyab")} aria-label={t("Vasatyab")} aria-expanded={open} onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="5" cy="6" r="2" />
          <circle cx="19" cy="7" r="2" />
          <circle cx="12" cy="19" r="2" />
          <path d="M6.6 7.2 10.8 11M17.5 8.6 13.4 11M12 14v3" />
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
        </svg>
      </Button>
      {open && (
        <div className="map-filter vasa-panel" role="dialog" aria-label={t("Vasatyab")}>
          <div className="row">
            <b className="grow">📍 {t("Vasatyab")}</b>
            <button className="close" onClick={() => setOpen(false)} aria-label={t("Close")}>✕</button>
          </div>
          <VasatyabPanel view={v.view} method={v.method} setMethod={v.setMethod} reload={v.reload} />
        </div>
      )}
    </>
  );
}

/** On the 2D map: each member joined by a line to the middle, the middle itself, and the gather point. */
export function VasatyabLayer({ view }: { view: MidView }) {
  const mid = view.point;
  return (
    <>
      {mid &&
        view.members.map((m) =>
          m.lat == null || m.lng == null ? null : (
            <Polyline key={`l${m.userId}`} positions={[[m.lat, m.lng], [mid.lat, mid.lng]]} interactive={false} pathOptions={{ color: "#f0c05a", weight: 2.5, opacity: 0.85, dashArray: "6 8" }} />
          ),
        )}
      {view.members.map((m) =>
        m.lat == null || m.lng == null || m.me ? null : (
          <Marker key={`m${m.userId}`} position={[m.lat, m.lng]} zIndexOffset={900} interactive={false} icon={icon(`<span class="ring" style="color:#f0c05a"></span>${esc(m.avatar)}<span class="nm">${esc(m.name)}${m.distM != null ? ` · ${esc(formatDistance(m.distM))}` : ""}</span>`, "place vasa-member", 36)} />
        ),
      )}
      {mid && (
        <Marker position={[mid.lat, mid.lng]} zIndexOffset={1000} interactive={false} icon={icon(`<span class="beacon"></span><span class="bc-pin">📍</span><span class="bc-label">${esc(t("The middle"))}</span>`, "story-beacon", 56)} />
      )}
      {view.meet && (
        <Marker position={[view.meet.lat, view.meet.lng]} zIndexOffset={1100} interactive={false} icon={icon(`<span class="beacon ok"></span><span class="bc-pin">🚩</span><span class="bc-label">${esc(view.meet.name || t("Gather point"))}</span>`, "story-beacon", 56)} />
      )}
    </>
  );
}
