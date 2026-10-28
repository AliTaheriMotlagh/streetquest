"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtNum, msg, t, toAsciiDigits } from "@/lib/i18n";
import { ACHIEVEMENTS } from "@/lib/progression";
import { S } from "@/lib/settings";
import { RARITY_COLOR, RARITY_LABEL } from "@/lib/catalog";
import { distanceM, formatDistance, regionKey } from "@/lib/geo";
import { api, fmtTime, type LatLng, type WorldDelivery, type WorldEvent, type WorldNote, type WorldRide } from "./client";
import { RIDE_MAX_FARE, RIDE_MIN_FARE, RIDE_MIN_TRIP_M, RIDE_STATUS, suggestFare, type RideStatus } from "@/lib/rides";
import { MoveIcon, Sheet, Tabs, useGame } from "./ui";
import { QuestsTab } from "./Hero";
import { askConfirm } from "@/components/Dialogs";
import { resizePhoto } from "./photo";
import { isMuted, onMuteChange, setMuted, sfx } from "./sfx";
import { musicOn, musicVolume, onMusicChange, setMusicOn, setMusicVolume } from "./music";
import { canInstall, currentPushSub, disablePush, enablePush, isIos, isStandalone, onPwaChange, promptInstall, pushSupported } from "@/components/pwaClient";
import { Button } from "@/components/Button";
import { ModeCards } from "./LocationUi";
import { autoIsLite, onPerfChange, perfMode, setPerfMode, type PerfMode } from "@/components/perf";
import { LanguagePicker } from "@/components/LanguageSwitch";

const navUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

export function LocationField({ label, value, onChange }: { label: string; value: LatLng | null; onChange: (p: LatLng) => void }) {
  const { pos, pick } = useGame();
  return (
    <>
      <label>{label}</label>
      <div className="row">
        <div className="grow small mono muted" dir="ltr">{value ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : t("not set")}</div>
        <Button type="button" className="btn ghost small" onClick={() => pos && onChange(pos)}>
          📍 {t("Here")}
        </Button>
        <Button type="button" className="btn ghost small" onClick={() => pick(t("Tap the map: {label}", { label }), onChange)}>
          🗺️ {t("Pick")}
        </Button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Nearby
export function NearbyPanel({ onClose, peek }: { onClose: () => void; peek: boolean }) {
  const { world, pos, act, toast, teleport } = useGame();
  const [tab, setTab] = useState<"money" | "stores" | "notes">("money");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [radius, setRadius] = useState(50);
  const d = (p: LatLng) => (pos ? distanceM(pos, p) : 0);

  const money = (world?.money ?? []).slice().sort((a, b) => d(a) - d(b));
  const stores = (world?.places ?? []).slice().sort((a, b) => d(a.place) - d(b.place));
  const row = (key: string, icon: string, title: string, sub: string, to: LatLng, gold?: boolean) => (
    <div key={key} className="card list-item">
      <div className={`icon-tile ${gold ? "money-tile gold" : ""}`}>{icon}</div>
      <div className="grow">
        <b>{title}</b>
        <div className="small muted">{sub}</div>
      </div>
      {teleport && d(to) > 40 && <Button className="btn ghost small" onClick={() => teleport(to)}><MoveIcon /></Button>}
    </div>
  );

  return (
    <Sheet title={t("Nearby")} onClose={onClose} peek={peek} help="nearby">
      <Tabs value={tab} onChange={setTab} tabs={[["money", t("💵 Money ({n})", { n: money.length })], ["stores", t("🏪 Stores ({n})", { n: stores.length })], ["notes", t("Posts ({n})", { n: world?.notes.length ?? 0 })]]} />
      {tab === "money" &&
        (money.length ? (
          money.map((m) => row(m.id, "💵", m.drop ? `✨ ${m.drop.label}` : t("{n} toman", { n: m.amount }), `${m.drop ? `${t("{n} toman", { n: m.amount })} · ` : ""}${formatDistance(d(m))}`, m, !!m.drop))
        ) : (
          <div className="empty">{t("No money left nearby. Walk a few blocks — new money appears every 20 minutes.")}</div>
        ))}
      {tab === "stores" &&
        (stores.length ? (
          stores.map((m) => row(m.id, m.emoji, `${t(m.title)} · ${m.place.name}`, `${t("{n} toman", { n: m.toman })} · ${formatDistance(d(m.place))}`, m.place))
        ) : (
          <div className="empty">{t("No store missions around here right now.")}</div>
        ))}
      {tab === "notes" && (
        <>
          <div className="card">
            <b>📍 {t("Pin a post right here")}</b>
            <p className="small muted" style={{ margin: "4px 0 8px" }}>
              {t("Text and/or a photo. Only players who physically come within the radius can see it. Likes earn you XP.")}
            </p>
            <textarea rows={2} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("The best tacos in town are behind this wall…")} dir="auto" />
            {photo && (
              <div className="photo-preview">
                <img src={photo} alt={t("Your photo")} />
                <Button className="close" onClick={() => setPhoto(null)} aria-label={t("Remove photo")}>✕</Button>
              </div>
            )}
            <div className="row wrap" style={{ marginTop: 8 }}>
              <label className="btn ghost small" style={{ margin: 0 }}>
                📸 {photo ? t("Change") : t("Photo")}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (!f) return;
                    try {
                      setPhoto(await resizePhoto(f));
                      sfx("photo");
                    } catch (err) {
                      toast({ kind: "error", title: (err as Error).message });
                    }
                  }}
                />
              </label>
              <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} style={{ width: "auto" }}>
                {[20, 50, 100, 200].map((r) => (
                  <option key={r} value={r}>
                    {t("{n} m radius", { n: r })}
                  </option>
                ))}
              </select>
              <span className="grow" />
              <Button
                className="btn small"
                disabled={!note.trim() && !photo}
                onClick={async () => {
                  const ok = await act(() => api("/api/notes", { body: { body: note, radiusM: radius, photo: photo ?? undefined } }));
                  if (ok) {
                    setNote("");
                    setPhoto(null);
                  }
                }}
              >
                {t("Post · {n} 🪙", { n: photo ? 15 : 5 })}
              </Button>
            </div>
          </div>
          {world?.notes.map((n) => (
            <NoteCard key={n.id} n={n} dist={d(n)} />
          ))}
        </>
      )}
    </Sheet>
  );
}

/** A pinned post: text, an optional photo (served only to players standing there), like / report. */
export function NoteCard({ n, dist }: { n: WorldNote; dist: number }) {
  const { act } = useGame();
  const [likes, setLikes] = useState(n.likes);
  return (
    <div className="card note-card">
      <div className="small muted">
        {n.author.avatar} {n.author.username} · {t("{d} away", { d: formatDistance(dist) })} · {fmtTime(n.createdAt)}
      </div>
      {n.unlocked ? (
        <>
          {n.hasPhoto && <img className="note-photo" src={`/api/notes/${n.id}`} alt={t("Photo by {name}", { name: n.author.username })} loading="lazy" />}
          {n.body && <div style={{ marginTop: 6 }} dir="auto">{n.body}</div>}
          <div className="row" style={{ marginTop: 8 }}>
            <Button className="btn ghost small" disabled={n.mine} onClick={() => act(async () => { const r = await api<{ message: string; likes: number }>(`/api/notes/${n.id}`, { body: { kind: "like" } }); setLikes(r.likes); return r; })}>
              ❤️ {likes}
            </Button>
            <span className="grow" />
            {!n.mine && (
              <Button className="btn ghost small" aria-label={t("Report")} onClick={() => askConfirm(t("Report this post?"), { body: t("Posts with several reports are hidden and reviewed by moderators."), ok: t("Report"), danger: true }).then((ok) => ok && act(() => api(`/api/notes/${n.id}`, { body: { kind: "report" } })))}>
                🚩
              </Button>
            )}
          </div>
        </>
      ) : (
        <div style={{ marginTop: 4 }}>
          <i className="muted">🔒 {n.hasPhoto ? t("📸 A photo is pinned here.") : ""} {t("Walk within {m} m to see it", { m: n.radiusM })}</i>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- Jobs (real deliveries)
type MyDeliveries = {
  sent: (WorldDelivery & { dropoffCode: string; courier: { username: string } | null })[];
  carrying: (WorldDelivery & { sender: { username: string } })[];
};

/** "navigate" opens maps; in test mode it just jumps you there. */
export function GoTo({ lat, lng, label }: { lat: number; lng: number; label?: string }) {
  const { teleport } = useGame();
  return teleport ? (
    <a href="#" onClick={(e) => (e.preventDefault(), teleport({ lat, lng }))}><MoveIcon /> {t("go")}</a>
  ) : (
    <a href={navUrl(lat, lng)} target="_blank" rel="noreferrer">{label ?? t("navigate")}</a>
  );
}

function DeliveryRoute({ d }: { d: WorldDelivery }) {
  return (
    <div className="small" style={{ margin: "6px 0" }}>
      <div>
        🟢 <b>{t("Pickup:")}</b> <span dir="auto">{d.pickupLabel}</span>{" "}
        <GoTo lat={d.pickupLat} lng={d.pickupLng} />
      </div>
      <div>
        🔴 <b>{t("Drop-off:")}</b> <span dir="auto">{d.dropoffLabel}</span>{" "}
        <GoTo lat={d.dropoffLat} lng={d.dropoffLng} />
      </div>
    </div>
  );
}

export function JobsPanel({ onClose, peek }: { onClose: () => void; peek: boolean }) {
  const { world } = useGame();
  const [kind, setKind] = useState<"deliveries" | "rides">("deliveries");
  return (
    <Sheet title={t("Jobs")} onClose={onClose} peek={peek} help="jobs">
      <div className="seg" role="tablist">
        <button role="tab" aria-selected={kind === "deliveries"} className={kind === "deliveries" ? "on" : ""} onClick={() => setKind("deliveries")}>
          📦 {t("Deliveries")} {!!world?.deliveries.length && <span className="seg-n">{fmtNum(world.deliveries.length)}</span>}
        </button>
        <button role="tab" aria-selected={kind === "rides"} className={kind === "rides" ? "on" : ""} onClick={() => setKind("rides")}>
          🚕 {t("Rides")} {!!world?.rides.length && <span className="seg-n">{fmtNum(world.rides.length)}</span>}
        </button>
      </div>
      {kind === "deliveries" ? <DeliveriesTab /> : <RidesTab />}
    </Sheet>
  );
}

function DeliveriesTab() {
  const { world, act, me } = useGame();
  const [tab, setTab] = useState<"open" | "carrying" | "sent" | "new">("open");
  const [mine, setMine] = useState<MyDeliveries>({ sent: [], carrying: [] });
  const [codes, setCodes] = useState<Record<string, string>>({});
  const [f, setF] = useState({ title: "", description: "", pickupLabel: "", dropoffLabel: "", reward: 50 });
  const [pickup, setPickup] = useState<LatLng | null>(null);
  const [dropoff, setDropoff] = useState<LatLng | null>(null);

  const load = useCallback(() => api<MyDeliveries>("/api/deliveries").then(setMine).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load, tab]);

  const doAct = async (id: string, action: string, code?: string) => {
    if (await act(() => api(`/api/deliveries/${id}`, { body: { action, code } }))) load();
  };

  const create = async () => {
    if (!pickup || !dropoff) return;
    const ok = await act(() =>
      api("/api/deliveries", {
        body: { ...f, pickupLat: pickup.lat, pickupLng: pickup.lng, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng },
      }),
    );
    if (ok) {
      setF({ title: "", description: "", pickupLabel: "", dropoffLabel: "", reward: 50 });
      setTab("sent");
    }
  };

  const STATUS: Record<string, string> = { OPEN: t("🟡 Waiting for courier"), ACCEPTED: t("🔵 Courier on the way"), PICKED_UP: t("🟣 In transit"), DELIVERED: t("✅ Delivered"), CANCELLED: t("⚫ Cancelled") };

  return (
    <>
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ["open", t("Open ({n})", { n: world?.deliveries.length ?? 0 })],
          ["carrying", t("Carrying")],
          ["sent", t("My requests")],
          ["new", t("+ Request")],
        ]}
      />
      {tab === "open" &&
        (world?.deliveries.length ? (
          [...world.deliveries]
            .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0))
            .map((d) => (
              <div key={d.id} className="card">
                <div className="row">
                  <b className="grow" dir="auto">📦 {d.title}</b>
                  <span className="tag" style={{ color: "var(--yellow)" }}>
                    {fmtNum(d.reward)} 🪙
                  </span>
                </div>
                <div className="small muted">
                  {t("by {name} · pickup {d} away · {trip} trip", { name: d.sender?.username ?? "", d: formatDistance(d.distanceM ?? 0), trip: formatDistance(distanceM({ lat: d.pickupLat, lng: d.pickupLng }, { lat: d.dropoffLat, lng: d.dropoffLng })) })}
                </div>
                {d.description && <p className="small" dir="auto">{d.description}</p>}
                <DeliveryRoute d={d} />
                <Button className="btn green small" onClick={() => doAct(d.id, "accept")}>
                  {t("Accept job")}
                </Button>
              </div>
            ))
        ) : (
          <div className="empty">{t("No open delivery requests near you.")}</div>
        ))}

      {tab === "carrying" &&
        (mine.carrying.length ? (
          mine.carrying.map((d) => (
            <div key={d.id} className="card">
              <div className="row">
                <b className="grow" dir="auto">{d.title}</b>
                <span className="tag">{STATUS[d.status]}</span>
              </div>
              <div className="small muted">{t("for {name} · reward {n} 🪙", { name: d.sender.username, n: d.reward })}</div>
              <DeliveryRoute d={d} />
              {d.status === "ACCEPTED" && (
                <div className="row">
                  <Button className="btn cyan small" onClick={() => doAct(d.id, "pickup")}>
                    {t("I'm at pickup")}
                  </Button>
                  <Button className="btn ghost small" onClick={() => doAct(d.id, "cancel")}>
                    {t("Drop job")}
                  </Button>
                </div>
              )}
              {d.status === "PICKED_UP" && (
                <div className="row">
                  <input
                    className="grow"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder={t("Handover code")}
                    dir="ltr"
                    value={codes[d.id] ?? ""}
                    onChange={(e) => setCodes({ ...codes, [d.id]: toAsciiDigits(e.target.value).replace(/\D/g, "") })}
                  />
                  <Button className="btn green small" onClick={() => doAct(d.id, "deliver", codes[d.id])}>
                    {t("Deliver")}
                  </Button>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="empty">{t("You aren't carrying anything. Grab an open job!")}</div>
        ))}

      {tab === "sent" &&
        (mine.sent.length ? (
          mine.sent.map((d) => (
            <div key={d.id} className="card">
              <div className="row">
                <b className="grow" dir="auto">{d.title}</b>
                <span className="tag">{STATUS[d.status]}</span>
              </div>
              <div className="small muted">
                {t("Reward {n} 🪙", { n: d.reward })} {d.courier && `· ${t("courier: {name}", { name: d.courier.username })}`}
              </div>
              <DeliveryRoute d={d} />
              {d.status !== "DELIVERED" && d.status !== "CANCELLED" && (
                <div className="card hl small">
                  {t("Handover code:")} <b className="mono" dir="ltr" style={{ fontSize: 18 }}>{d.dropoffCode}</b> — {t("give this only to the recipient.")}
                </div>
              )}
              {d.status === "OPEN" && (
                <Button className="btn ghost small" onClick={() => doAct(d.id, "cancel")}>
                  {t("Cancel & refund")}
                </Button>
              )}
            </div>
          ))
        ) : (
          <div className="empty">{t("You haven't requested any deliveries.")}</div>
        ))}

      {tab === "new" && (
        <div>
          <div className="card small">
            {t("⚠️ Only legal, safe items. No cash, valuables, weapons, drugs, food that can spoil or anything you wouldn't hand to a stranger. The reward is held in escrow and paid when the courier enters the handover code.")}
          </div>
          <label>{t("What is it?")}</label>
          <input value={f.title} maxLength={60} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t("Book for my friend")} dir="auto" />
          <label>{t("Details (size, how to find you…)")}</label>
          <textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} dir="auto" />
          <LocationField label={t("Pickup point")} value={pickup} onChange={setPickup} />
          <input value={f.pickupLabel} onChange={(e) => setF({ ...f, pickupLabel: e.target.value })} placeholder={t("e.g. Café entrance, 12 Main St")} style={{ marginTop: 6 }} dir="auto" />
          <LocationField label={t("Drop-off point")} value={dropoff} onChange={setDropoff} />
          <input value={f.dropoffLabel} onChange={(e) => setF({ ...f, dropoffLabel: e.target.value })} placeholder={t("e.g. Library front desk")} style={{ marginTop: 6 }} dir="auto" />
          <label>{t("Reward (coins) — you have {n}", { n: me.coins })}</label>
          <input inputMode="numeric" value={String(f.reward)} onChange={(e) => setF({ ...f, reward: Number(toAsciiDigits(e.target.value).replace(/\D/g, "")) || 0 })} />
          <Button className="btn block" style={{ marginTop: 14 }} disabled={!pickup || !dropoff || f.title.length < 3} onClick={create}>
            {t("Post request")}
          </Button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Rides (Uber-style)
type RidePeer = { id: string; username: string; avatar: string; pos: LatLng | null };
type MyRide = WorldRide & { pin?: string; acceptedAt: string | null; startedAt: string | null };
type MyRides = {
  riding: (MyRide & { pin: string; driver: RidePeer | null }) | null;
  driving: (MyRide & { rider: RidePeer }) | null;
  history: (WorldRide & { mine: "rider" | "driver"; rider: { username: string }; driver: { username: string } | null })[];
};

const pickupOf = (r: WorldRide) => ({ lat: r.pickupLat, lng: r.pickupLng });
const dropoffOf = (r: WorldRide) => ({ lat: r.dropoffLat, lng: r.dropoffLng });

function RideRoute({ r }: { r: WorldRide }) {
  return (
    <div className="ride-route small">
      <div><span className="dot-pin a" /> <b dir="auto">{r.pickupLabel}</b> <GoTo lat={r.pickupLat} lng={r.pickupLng} /></div>
      <div className="ride-line" />
      <div><span className="dot-pin b" /> <b dir="auto">{r.dropoffLabel}</b> <GoTo lat={r.dropoffLat} lng={r.dropoffLng} /></div>
      <div className="muted">{t("{d} trip · {n, plural, one {# seat} other {# seats}}", { d: formatDistance(distanceM(pickupOf(r), dropoffOf(r))), n: r.seats })} · <b style={{ color: "var(--yellow)" }}>{fmtNum(r.fare)} 🪙</b></div>
      {r.note && <div className="muted" dir="auto">“{r.note}”</div>}
    </div>
  );
}

function RidesTab() {
  const { world, act, me, pos } = useGame();
  const [mine, setMine] = useState<MyRides | null>(null);
  const [pin, setPin] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [form, setForm] = useState({ pickupLabel: t("My location"), dropoffLabel: "", seats: 1, note: "" });
  // null = follow my live position (until the player pins a spot with Here / Pick).
  const [pinnedPickup, setPinnedPickup] = useState<LatLng | null>(null);
  const [dropoff, setDropoff] = useState<LatLng | null>(null);
  // What's typed in the fare box (kept as text so it can be cleared); null = use the suggestion.
  const [fare, setFare] = useState<string | null>(null);
  // Collapsed when riders are already waiting (drivers come here for the list), then the player's choice.
  const [formOpen, setFormOpen] = useState(() => !world?.rides.length);

  const load = useCallback(() => api<MyRides>("/api/rides").then(setMine).catch(() => {}), []);
  const active = !!(mine?.riding || mine?.driving);
  useEffect(() => {
    load();
    // While a ride is on, keep both sides' screens moving (driver distance, status).
    const t = setInterval(load, active ? 8_000 : 30_000);
    return () => clearInterval(t);
  }, [load, active]);
  const pickup = pinnedPickup ?? pos;
  const setPickup = (p: LatLng) => {
    setPinnedPickup(p);
    // A spot picked on the map isn't "my location" any more.
    if (form.pickupLabel === t("My location") && (!pos || distanceM(p, pos) > 30)) setForm((f) => ({ ...f, pickupLabel: "" }));
  };

  const doAct = async (id: string, action: string, extra: object = {}) => {
    const ok = await act(() => api(`/api/rides/${id}`, { body: { action, ...extra } }));
    if (ok) {
      setPin("");
      load();
    }
    return ok;
  };
  const suggested = pickup && dropoff ? suggestFare(pickup, dropoff) : RIDE_MIN_FARE;
  const price = fare === null ? suggested : Number(fare) || 0;
  const trip = pickup && dropoff ? distanceM(pickup, dropoff) : 0;
  // Say why the button is off instead of just greying it out.
  const problem = !pickup
    ? t("Waiting for your GPS — or pick the pickup on the map")
    : !dropoff
      ? t("Choose where you're going (📍 Here or 🗺️ Pick)")
      : trip < RIDE_MIN_TRIP_M
        ? t("The destination must be at least {m} m from the pickup", { m: RIDE_MIN_TRIP_M })
        : form.pickupLabel.trim().length < 2
          ? t("Name the pickup spot so the driver can find you")
          : form.dropoffLabel.trim().length < 2
            ? t("Name the destination")
            : price < RIDE_MIN_FARE
              ? t("The minimum fare is {n} 🪙", { n: RIDE_MIN_FARE })
              : price > RIDE_MAX_FARE
                ? t("The maximum fare is {n} 🪙", { n: RIDE_MAX_FARE })
                : price > me.coins
                  ? t("Not enough coins — you have {n} 🪙", { n: me.coins })
                  : null;
  const request = async () => {
    if (!pickup || !dropoff || problem) return;
    const ok = await act(() =>
      api("/api/rides", { body: { ...form, fare: price, pickupLat: pickup.lat, pickupLng: pickup.lng, dropoffLat: dropoff.lat, dropoffLng: dropoff.lng } }),
    );
    if (ok) {
      setForm({ pickupLabel: t("My location"), dropoffLabel: "", seats: 1, note: "" });
      setPinnedPickup(null);
      setDropoff(null);
      setFare(null);
      load();
    }
  };
  const away = (p: LatLng | null | undefined, to: LatLng) => (p ? formatDistance(distanceM(p, to)) : "—");

  if (!mine) return <div className="empty">{t("Loading…")}</div>;
  const { riding: r, driving: dr } = mine;

  return (
    <>
      {/* ---- I'm the rider */}
      {r && (
        <div className="card hl ride-card">
          <div className="row">
            <b className="grow">🚕 {t("Your ride")}</b>
            <span className="tag">{t(RIDE_STATUS[r.status as RideStatus])}</span>
          </div>
          {r.status === "REQUESTED" && <p className="small muted">{t("Waiting for a driver nearby… Your fare is held safely and refunded if nobody accepts.")}</p>}
          {r.driver && (
            <div className="ride-peer">
              <span className="ride-avatar">{r.driver.avatar}</span>
              <div className="grow">
                <b>{r.driver.username}</b>
                <div className="small muted">
                  {r.status === "ACCEPTED" ? t("is {d} from the pickup", { d: away(r.driver.pos, pickupOf(r)) }) : t("heading to {place}", { place: r.dropoffLabel })}
                  {!r.driver.pos && ` · ${t("location hidden (offline)")}`}
                </div>
              </div>
            </div>
          )}
          {r.status !== "ONBOARD" && (
            <div className="ride-pin">
              <span className="small muted">{t("Tell your driver this PIN at pickup")}</span>
              <b className="mono" dir="ltr">{r.pin}</b>
            </div>
          )}
          <RideRoute r={r} />
          {r.status === "ONBOARD" && (
            <>
              <p className="small muted">{t("{d} to go.", { d: away(pos, dropoffOf(r)) })}</p>
              <Button className="btn green block" onClick={() => askConfirm(t("Arrived?"), { body: t("This pays {name} the {n}-coin fare.", { name: r.driver?.username ?? t("your driver"), n: r.fare }), ok: t("🏁 I've arrived") }).then((ok) => ok && doAct(r.id, "arrive"))}>
                {t("🏁 I've arrived")}
              </Button>
            </>
          )}
          {(r.status === "REQUESTED" || r.status === "ACCEPTED") && (
            <Button className="btn ghost small" onClick={() => askConfirm(t("Cancel this ride?"), { body: t("Your fare is refunded in full."), ok: t("Cancel ride"), cancel: t("Keep waiting"), danger: true }).then((ok) => ok && doAct(r.id, "cancel"))}>
              {t("Cancel & refund")}
            </Button>
          )}
        </div>
      )}

      {/* ---- I'm the driver */}
      {dr && (
        <div className="card hl ride-card">
          <div className="row">
            <b className="grow">🚗 {t("You're driving")}</b>
            <span className="tag">{t(RIDE_STATUS[dr.status as RideStatus])}</span>
          </div>
          <div className="ride-peer">
            <span className="ride-avatar">{dr.rider.avatar}</span>
            <div className="grow">
              <b>{dr.rider.username}</b>
              <div className="small muted">
                {dr.status === "ACCEPTED" ? t("Pickup is {d} from you", { d: away(pos, pickupOf(dr)) }) : t("Drop-off is {d} away", { d: away(pos, dropoffOf(dr)) })}
                {dr.status === "ACCEPTED" && dr.rider.pos && ` · ${t("rider {d} from it", { d: away(dr.rider.pos, pickupOf(dr)) })}`}
              </div>
            </div>
          </div>
          <RideRoute r={dr} />
          {dr.status === "ACCEPTED" && (
            <>
              <div className="row">
                <input className="grow code-input" inputMode="numeric" maxLength={4} dir="ltr" placeholder={t("Rider's PIN")} value={pin} onChange={(e) => setPin(toAsciiDigits(e.target.value).replace(/\D/g, "").slice(0, 4))} />
                <Button className="btn green small" disabled={pin.length !== 4} onClick={() => doAct(dr.id, "start", { pin })}>{t("Start ride")}</Button>
              </div>
              <Button className="btn ghost small" style={{ marginTop: 8 }} onClick={() => askConfirm(t("Drop this ride?"), { body: t("The rider goes back in the queue for another driver."), ok: t("Drop ride"), danger: true }).then((ok) => ok && doAct(dr.id, "cancel"))}>
                {t("Drop ride")}
              </Button>
            </>
          )}
          {dr.status === "ONBOARD" && (
            <>
              <Button className="btn green block" onClick={() => doAct(dr.id, "complete")}>{t("🏁 End ride · collect {n} 🪙", { n: dr.fare })}</Button>
              <p className="small muted">{t("Both of you need to be at the drop-off — or your rider taps “I've arrived”.")}</p>
            </>
          )}
        </div>
      )}

      {/* ---- Request a car */}
      {!r && (
        <details className="card ride-request" open={formOpen} onToggle={(e) => setFormOpen(e.currentTarget.open)}>
          <summary><b>🚕 {t("Request a car")}</b></summary>
          <LocationField label={t("Pickup")} value={pickup} onChange={setPickup} />
          <input value={form.pickupLabel} maxLength={120} onChange={(e) => setForm({ ...form, pickupLabel: e.target.value })} placeholder={t("e.g. Café entrance")} style={{ marginTop: 6 }} dir="auto" />
          <LocationField label={t("Where to?")} value={dropoff} onChange={setDropoff} />
          <input value={form.dropoffLabel} maxLength={120} onChange={(e) => setForm({ ...form, dropoffLabel: e.target.value })} placeholder={t("e.g. Central station")} style={{ marginTop: 6 }} dir="auto" />
          <div className="grid2" style={{ marginTop: 4 }}>
            <div>
              <label>{t("Seats")}</label>
              <select value={form.seats} onChange={(e) => setForm({ ...form, seats: Number(e.target.value) })}>
                {[1, 2, 3, 4].map((n) => <option key={n} value={n}>{fmtNum(n)}</option>)}
              </select>
            </div>
            <div>
              <label>{t("Fare (🪙) · you have {n}", { n: me.coins })}</label>
              <input
                type="text"
                inputMode="numeric"
                maxLength={5}
                value={fare ?? String(suggested)}
                onChange={(e) => setFare(toAsciiDigits(e.target.value).replace(/\D/g, "").replace(/^0+(?=\d)/, ""))}
                onBlur={() => fare === "" && setFare(null)}
              />
            </div>
          </div>
          {pickup && dropoff && (
            <p className="small muted">
              {t("{d} trip · suggested {n} 🪙", { d: formatDistance(trip), n: suggested })}
              {fare !== null && price !== suggested && <> · <a href="#" onClick={(e) => (e.preventDefault(), setFare(null))}>{t("use suggestion")}</a></>}
            </p>
          )}
          <label>{t("Note for the driver")}</label>
          <input value={form.note} maxLength={200} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder={t("Wearing a red jacket")} dir="auto" />
          <Button
            className="btn yellow block"
            style={{ marginTop: 12 }}
            disabled={!!problem}
            onClick={request}
          >
            {t("Request car · {n} 🪙", { n: price })}
          </Button>
          {problem && <p className="small" style={{ marginTop: 6, color: "var(--yellow)" }}>{problem}</p>}
          <p className="small muted" style={{ marginTop: 8 }}>
            {t("⚠️ Rides are with other real players. Only get in with people you trust, wear a seatbelt and follow local laws. The fare is held until you arrive.")}
          </p>
        </details>
      )}

      {/* ---- Riders waiting (drive them) */}
      {!dr && (
        <>
          <label>{t("Riders waiting near you")}</label>
          {world?.rides.length ? (
            [...world.rides]
              .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0))
              .map((x) => (
                <div key={x.id} className="card">
                  <div className="row">
                    <b className="grow">{x.rider?.avatar} {x.rider?.username}</b>
                    <span className="small muted">{t("{d} away", { d: formatDistance(x.distanceM ?? 0) })}</span>
                  </div>
                  <RideRoute r={x} />
                  <Button className="btn green small" onClick={() => doAct(x.id, "accept")}>{t("Accept ride")}</Button>
                </div>
              ))
          ) : (
            <div className="empty">{t("Nobody needs a ride right now. Requests pop up here and on the map as 🚕.")}</div>
          )}
        </>
      )}

      {!!mine.history.length && (
        <>
          <Button className="btn ghost small" style={{ marginTop: 6 }} onClick={() => setShowHistory(!showHistory)}>
            {showHistory ? t("Hide past rides ({n})", { n: mine.history.length }) : t("Show past rides ({n})", { n: mine.history.length })}
          </Button>
          {showHistory &&
            mine.history.map((h) => (
              <div key={h.id} className="card small">
                <div className="row">
                  <span className="grow">{h.mine === "rider" ? t("🧍 Rode to {place}", { place: h.dropoffLabel }) : t("🚗 Drove to {place}", { place: h.dropoffLabel })}</span>
                  <span className="tag">{t(RIDE_STATUS[h.status as RideStatus])}</span>
                </div>
                <div className="muted">
                  {h.mine === "rider" ? (h.driver ? t("with {name}", { name: h.driver.username }) : t("no driver")) : t("for {name}", { name: h.rider.username })} · {fmtNum(h.fare)} 🪙 · {fmtTime(h.createdAt)}
                </div>
              </div>
            ))}
        </>
      )}
    </>
  );
}

// ---------------------------------------------------------------- Crew (friends, chat, ranks)
type Friend = { friendshipId: string; id: string; username: string; avatar: string; level: number; online: boolean; lastSeenAt: string | null };
type Msg = { id: string; room: string; body: string; createdAt: string; author: { id: string; username: string; avatar: string } };

function Chat({ room }: { room: string }) {
  const { me, toast } = useGame();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const log = useRef<HTMLDivElement>(null);

  const newest = useRef<string | null>(null);
  useEffect(() => {
    setMsgs([]);
    newest.current = null;
    shown.current = 0;
    let stop = false;
    const pull = async (first = false) => {
      try {
        const q = newest.current && !first ? `&after=${encodeURIComponent(newest.current)}` : "";
        const r = await api<{ messages: Msg[] }>(`/api/chat?room=${encodeURIComponent(room)}${q}`);
        if (stop || !r.messages.length) return;
        newest.current = r.messages[r.messages.length - 1].createdAt;
        setMsgs((x) => {
          const seen = new Set(x.map((m) => m.id));
          return [...x, ...r.messages.filter((m) => !seen.has(m.id))];
        });
      } catch (e) {
        if (first) toast({ kind: "error", title: (e as Error).message });
      }
    };
    pull(true);
    const t = setInterval(() => !document.hidden && pull(), 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [room]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the newest message in view — but only for a reader who is already at the bottom
  // (or just sent one): someone scrolled up into the history stays where they are. Scroll
  // only the log (scrollIntoView would also move the sheet/page), and use a block body:
  // desktop Chrome's scroll methods return a Promise, and an effect must only return a cleanup.
  const follow = useRef(true);
  const shown = useRef(0);
  const onScroll = () => {
    const el = log.current;
    if (el) follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  useEffect(() => {
    const el = log.current;
    const first = shown.current === 0;
    shown.current = msgs.length;
    if (!el || !msgs.length) return;
    if (first) {
      el.scrollTop = el.scrollHeight; // opening a room: start at the newest, no animation
      follow.current = true;
    } else if (follow.current || msgs[msgs.length - 1].author.id === me.id) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [msgs]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    try {
      const r = await api<{ message: Msg }>("/api/chat", { body: { room, body } });
      newest.current = r.message.createdAt;
      setMsgs((x) => (x.some((m) => m.id === r.message.id) ? x : [...x, r.message]));
    } catch (err) {
      toast({ kind: "error", title: (err as Error).message });
      setText(body);
    }
  };

  return (
    <div className="chat">
      <div className="chat-log" ref={log} onScroll={onScroll}>
        {msgs.length === 0 && <div className="empty">{t("No messages yet. Say hi 👋")}</div>}
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.author.id === me.id ? "me" : ""}`}>
            {m.author.id !== me.id && (
              <div className="who">
                {m.author.avatar} {m.author.username}
              </div>
            )}
            <div dir="auto">{m.body}</div>
          </div>
        ))}
      </div>
      <form className="row" onSubmit={send} style={{ paddingTop: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder={t("Message…")} dir="auto" enterKeyHint="send" />
        <Button className="btn small">{t("Send")}</Button>
      </form>
    </div>
  );
}

export function CrewPanel({ onClose, peek, chat, setChat }: { onClose: () => void; peek: boolean; chat: { room: string; label: string } | null; setChat: (c: { room: string; label: string } | null) => void }) {
  const { act, pos, me, startCall } = useGame();
  const [tab, setTab] = useState<"friends" | "chat" | "ranks">(chat ? "chat" : "friends");
  const [data, setData] = useState<{ friends: Friend[]; incoming: Friend[]; outgoing: Friend[] }>({ friends: [], incoming: [], outgoing: [] });
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"global" | "friends">("global");
  const [by, setBy] = useState<"xp" | "toman">("toman");
  const [board, setBoard] = useState<{ top: { id: string; username: string; avatar: string; level: number; xp: number; toman: number; me: boolean }[]; myRank: number } | null>(null);
  const [events, setEvents] = useState<WorldEvent[]>([]);

  const load = useCallback(() => api<typeof data>("/api/friends").then(setData).catch(() => {}), []);
  useEffect(() => {
    load();
    api<{ events: WorldEvent[] }>("/api/events").then((r) => setEvents(r.events.filter((e) => e.joined))).catch(() => {});
    const t = setInterval(load, 15_000); // refresh online dots
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (chat) setTab("chat");
  }, [chat]);
  useEffect(() => {
    if (tab === "ranks") api<NonNullable<typeof board>>(`/api/leaderboard?scope=${scope}&by=${by}`).then(setBoard).catch(() => {});
  }, [tab, scope, by]);

  const fr = async (body: object) => (await act(() => api("/api/friends", { body }))) && load();
  const dm = (f: Friend) => setChat({ room: `dm:${[me.id, f.id].sort().join(":")}`, label: `${f.avatar} ${f.username}` });

  const rooms: { room: string; label: string }[] = [
    { room: "global", label: t("🌍 Global") },
    ...(pos ? [{ room: `local:${regionKey(pos)}`, label: t("📡 Local") }] : []),
    ...events.map((e) => ({ room: `event:${e.id}`, label: `🎉 ${e.title}` })),
    ...data.friends.map((f) => ({ room: `dm:${[me.id, f.id].sort().join(":")}`, label: `${f.avatar} ${f.username}` })),
  ];
  const active = chat ?? rooms[0];

  return (
    <Sheet title={t("Crew")} onClose={onClose} peek={peek} help="crew">
      <Tabs value={tab} onChange={setTab} tabs={[["friends", data.incoming.length ? t("Friends ({n})", { n: data.incoming.length }) : t("Friends")], ["chat", t("Chat")], ["ranks", t("Ranks")]]} />

      {tab === "friends" && (
        <>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              fr({ action: "request", username: name }).then(() => setName(""));
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("Add by player name")} dir="ltr" />
            <Button className="btn small" disabled={!name.trim()}>
              {t("Add")}
            </Button>
          </form>
          {data.incoming.length > 0 && <h3 style={{ fontSize: 14, margin: "14px 0 8px" }}>{t("Requests")}</h3>}
          {data.incoming.map((f) => (
            <div key={f.friendshipId} className="card list-item">
              <div className="icon-tile">{f.avatar}</div>
              <b className="grow">{f.username}</b>
              <Button className="btn green small" aria-label={t("Accept")} onClick={() => fr({ action: "accept", friendshipId: f.friendshipId })}>
                ✓
              </Button>
              <Button className="btn ghost small" aria-label={t("Decline")} onClick={() => fr({ action: "decline", friendshipId: f.friendshipId })}>
                ✕
              </Button>
            </div>
          ))}
          <h3 style={{ fontSize: 14, margin: "14px 0 8px" }}>
            {t("Friends · {n} online", { n: data.friends.filter((f) => f.online).length })}
          </h3>
          {data.friends.length === 0 && <div className="empty">{t("No crew yet. Add players you meet on the map!")}</div>}
          {[...data.friends]
            .sort((a, b) => Number(b.online) - Number(a.online))
            .map((f) => (
              <div key={f.friendshipId} className="card list-item friend-row">
                <div className="icon-tile">{f.avatar}</div>
                <div className="grow friend-who">
                  <div className="friend-name">
                    <b>{f.username}</b> <span className="small muted">{t("Lv {n}", { n: f.level })}</span>
                  </div>
                  <div className="small muted">
                    <span className={`dot ${f.online ? "on" : ""}`} /> {f.online ? t("Online") : f.lastSeenAt ? t("Seen {when}", { when: fmtTime(f.lastSeenAt) }) : t("Offline")}
                  </div>
                </div>
                <div className="friend-actions">
                <Button className="btn cyan small" onClick={() => dm(f)} aria-label={t("Message {name}", { name: f.username })}>
                  💬
                </Button>
                <Button className="btn green small" onClick={() => startCall(f, false)} aria-label={t("Voice call {name}", { name: f.username })}>
                  📞
                </Button>
                <Button className="btn green small" onClick={() => startCall(f)} aria-label={t("Video call {name}", { name: f.username })}>
                  📹
                </Button>
                <Button className="btn ghost small" aria-label={t("Remove {name}", { name: f.username })} onClick={() => askConfirm(t("Remove {name}?", { name: f.username }), { ok: t("Remove"), danger: true }).then((ok) => ok && fr({ action: "remove", friendshipId: f.friendshipId }))}>
                  ✕
                </Button>
                </div>
              </div>
            ))}
          {data.outgoing.length > 0 && <p className="small muted">{t("Pending: {names}", { names: data.outgoing.map((f) => f.username).join(t(", ")) })}</p>}
        </>
      )}

      {tab === "chat" && (
        <>
          <div className="tabs">
            {rooms.map((r) => (
              <Button key={r.room} className={active.room === r.room ? "on" : ""} onClick={() => setChat(r)}>
                {r.label}
              </Button>
            ))}
          </div>
          <Chat room={active.room} />
        </>
      )}

      {tab === "ranks" && (
        <>
          <Tabs value={scope} onChange={setScope} tabs={[["global", t("🌍 World")], ["friends", t("🤝 Crew")]]} />
          <Tabs value={by} onChange={setBy} tabs={[["toman", t("💵 Toman")], ["xp", t("⭐ XP")]]} />
          {board && <p className="small muted">{t("Your rank: #{n}", { n: board.myRank })}</p>}
          {board?.top.map((p, i) => (
            <div key={p.id} className={`card list-item ${p.me ? "hl" : ""}`}>
              <b style={{ width: 28, fontFamily: "var(--display)", color: i < 3 ? "var(--yellow)" : undefined }}>{fmtNum(i + 1)}</b>
              <span style={{ fontSize: 22 }}>{p.avatar}</span>
              <b className="grow">{p.username}</b>
              <span className="small muted">{t("Lv {n}", { n: p.level })}</span>
              <span className="small">{by === "toman" ? t("{n} toman", { n: p.toman }) : t("{n} XP", { n: p.xp })}</span>
            </div>
          ))}
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Events
export function EventsPanel({ onClose, peek }: { onClose: () => void; peek: boolean }) {
  const { world, act, pos, openChat } = useGame();
  const [tab, setTab] = useState<"nearby" | "mine" | "new">("nearby");
  const [mine, setMine] = useState<WorldEvent[]>([]);
  const [loc, setLoc] = useState<LatLng | null>(null);
  const [f, setF] = useState({ title: "", description: "", start: "", hours: 2, maxPlayers: 20, isPublic: true });

  const load = useCallback(() => api<{ events: WorldEvent[] }>("/api/events").then((r) => setMine(r.events)).catch(() => {}), []);
  useEffect(() => {
    load();
  }, [load, tab]);

  const evAct = async (id: string, action: string) => (await act(() => api(`/api/events/${id}`, { body: { action } }))) && load();
  const joined = new Map(mine.map((e) => [e.id, e]));

  const create = async () => {
    if (!loc || !f.start) return;
    const startsAt = new Date(f.start); // datetime-local is interpreted in the player's timezone
    const endsAt = new Date(startsAt.getTime() + f.hours * 3_600_000);
    const ok = await act(() =>
      api("/api/events", { body: { title: f.title, description: f.description, lat: loc.lat, lng: loc.lng, startsAt, endsAt, maxPlayers: f.maxPlayers, isPublic: f.isPublic } }),
    );
    if (ok) setTab("mine");
  };

  // A render helper, not a component: a component declared in here would be a new type
  // on every render, remounting the card (and eating taps on its buttons).
  const card = (e: WorldEvent) => {
    const j = joined.get(e.id);
    const live = new Date(e.startsAt).getTime() - 15 * 60_000 < Date.now();
    return (
      <div key={e.id} className={`card ${e.official ? "hl" : ""}`}>
        <div className="row">
          <b className="grow" dir="auto">
            {e.official ? "⭐" : "🎉"} {e.title}
          </b>
          {live && <span className="tag" style={{ color: "var(--green)" }}>{t("LIVE")}</span>}
        </div>
        <div className="small muted">
          {t("{start} – {end} · {n}/{max} going", { start: fmtTime(e.startsAt), end: fmtTime(e.endsAt), n: e.participants, max: e.maxPlayers })} {pos && `· ${formatDistance(distanceM(pos, e))}`}
        </div>
        {e.description && <p className="small" dir="auto">{e.description}</p>}
        <div className="row wrap">
          {!j && (
            <Button className="btn small" onClick={() => evAct(e.id, "join")}>
              {t("Join")}
            </Button>
          )}
          {j && !j.checkedIn && live && (
            <Button className="btn green small" onClick={() => evAct(e.id, "checkin")}>
              {t("Check in")}
            </Button>
          )}
          {j?.checkedIn && <span className="tag" style={{ color: "var(--green)" }}>{t("✓ Checked in")}</span>}
          {j && (
            <Button className="btn cyan small" onClick={() => openChat(`event:${e.id}`, `🎉 ${e.title}`)}>
              {t("Squad chat")}
            </Button>
          )}
          <a className="btn ghost small" href={navUrl(e.lat, e.lng)} target="_blank" rel="noreferrer">
            {t("Navigate")}
          </a>
          <Button
            className="btn ghost small"
            onClick={() => {
              const url = `${location.origin}/e/${e.slug}`;
              if (navigator.share) navigator.share({ title: e.title, url }).catch(() => {});
              else navigator.clipboard.writeText(url);
            }}
          >
            {t("Share")}
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Sheet title={t("Events")} onClose={onClose} peek={peek} help="events">
      <Tabs value={tab} onChange={setTab} tabs={[["nearby", t("Nearby")], ["mine", t("My events ({n})", { n: mine.length })], ["new", t("+ Create")]]} />
      {tab === "nearby" && (world?.events.length ? world.events.map(card) : <div className="empty">{t("No events within 8 km. Start one!")}</div>)}
      {tab === "mine" && (mine.length ? mine.map(card) : <div className="empty">{t("You haven't joined any events.")}</div>)}
      {tab === "new" && (
        <div>
          <label>{t("Title")}</label>
          <input value={f.title} maxLength={80} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t("Saturday night chest hunt")} dir="auto" />
          <label>{t("Description")}</label>
          <textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={t("Meet at the fountain, we sweep downtown together.")} dir="auto" />
          <LocationField label={t("Meeting point")} value={loc} onChange={setLoc} />
          <div className="form-grid">
            <div>
              <label>{t("Starts (your local time)")}</label>
              <input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
            </div>
            <div>
              <label>{t("Duration (hours)")}</label>
              <input inputMode="numeric" value={String(f.hours)} onChange={(e) => setF({ ...f, hours: Math.min(24, Number(toAsciiDigits(e.target.value).replace(/\D/g, "")) || 0) })} />
            </div>
            <div>
              <label>{t("Max players")}</label>
              <input inputMode="numeric" value={String(f.maxPlayers)} onChange={(e) => setF({ ...f, maxPlayers: Number(toAsciiDigits(e.target.value).replace(/\D/g, "")) || 0 })} />
            </div>
          </div>
          <label className="row" style={{ textTransform: "none" }}>
            <input type="checkbox" checked={f.isPublic} onChange={(e) => setF({ ...f, isPublic: e.target.checked })} style={{ width: "auto" }} />
            {t("Public (listed on the map & website)")}
          </label>
          <p className="small muted">{t("Checked-in players get a squad bonus: +10% XP for every other player who shows up.")}</p>
          <Button className="btn block" disabled={!loc || !f.start || f.title.length < 3 || f.hours < 1 || f.maxPlayers < 2} onClick={create}>
            {t("Create event")}
          </Button>
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Profile
const AVATARS = ["🕶️", "😎", "🦊", "🐺", "🐯", "🤖", "👽", "🥷", "🧛", "🦸", "🐉", "💀"];

export type HeroTabId = "quests" | "bag" | "awards" | "stats";
export function ProfilePanel({ onClose, peek, initialTab = "quests" }: { onClose: () => void; peek: boolean; initialTab?: HeroTabId }) {
  const { me, act, refresh, setHomeMode, startTour } = useGame();
  const [tab, setTab] = useState<HeroTabId>(initialTab);
  const refLink = typeof window !== "undefined" ? `${location.origin}/?ref=${me.referralCode}` : "";

  return (
    <Sheet title={t("Profile")} onClose={onClose} peek={peek} help="hero">
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="avatar" style={{ width: 64, height: 64, fontSize: 36 }}>
          {me.avatar}
          <span className="lvl">{me.level}</span>
        </div>
        <div className="grow">
          <h2 style={{ fontSize: 22 }}>{me.username}</h2>
          <div className="small" style={{ color: "var(--yellow)" }}>
            {me.title}
          </div>
          <div className="xpbar" style={{ width: "100%" }}>
            <i style={{ width: `${me.levelPct * 100}%` }} />
          </div>
          <div className="small muted">
            {t("{xp} / {next} XP", { xp: me.xp, next: me.nextLevelXp })}
          </div>
        </div>
      </div>

      {me.dailyAvailable && (
        <div className="card hl row">
          <div className="grow">
            <b>🎁 {t("Daily drop ready")}</b>
            <div className="small muted">
              {t("Streak {n} → +{coins} coins, +{xp} XP", { n: me.streak, coins: me.dailyReward.coins, xp: me.dailyReward.xp })}{me.dailyReward.gems ? `, +${fmtNum(me.dailyReward.gems)} 💎` : ""}
            </div>
          </div>
          <Button className="btn yellow small" onClick={() => act(() => api("/api/daily", { body: {} }))}>
            {t("Claim")}
          </Button>
        </div>
      )}

      <div className="res-bar">
        <span>💵 {t("{n} toman", { n: me.toman })}</span>
        <span>💎 {fmtNum(me.gems)}</span>
        <span>🪙 {fmtNum(me.coins)}</span>
      </div>

      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ["quests", me.questsReady ? t("📜 Quests ({n})", { n: me.questsReady }) : t("📜 Quests")],
          ["stats", t("⚙️ Settings")],
          ["bag", t("Bag ({n})", { n: me.inventory.reduce((s, i) => s + i.qty, 0) })],
          ["awards", t("Awards ({n})", { n: me.achievements.length })],
        ]}
      />

      {tab === "stats" && (
        <>
          <label>{t("Language")}</label>
          <LanguagePicker />
          <label>{t("Play mode")}</label>
          <ModeCards home={!!me.remotePlay} homeLocked={!S.remoteEnabled} onPick={(h) => h !== !!me.remotePlay && setHomeMode(h)} />
          <p className="small muted">{t("Each money pickup pays {gps} toman when you walk there, {home} toman from home. Sprints and walking goals need real walking.", { gps: S.moneyGps, home: S.moneyHome })}</p>
          <AppSettings />
          <SoundSettings />
          <GraphicsSettings />
          <div className="row wrap" style={{ marginTop: 8 }}>
            <Button className="btn cyan small" onClick={startTour}>📖 {t("Replay tutorial")}</Button>
            <Button className="btn ghost small" onClick={() => { try { Object.keys(localStorage).filter((k) => k.startsWith("sq_help_")).forEach((k) => localStorage.removeItem(k)); } catch {} }}>💡 {t("Show all tips again")}</Button>
          </div>
          <div className="grid3">
            <div className="stat"><b>{fmtNum(me.toman)}</b><span>{t("Toman")}</span></div>
            <div className="stat"><b>🔥 {fmtNum(me.streak)}</b><span>{t("Streak")}</span></div>
            <div className="stat"><b>{fmtNum(me.achievements.length)}</b><span>{t("Awards")}</span></div>
          </div>
          <label>{t("Callsign")}</label>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              const username = String(new FormData(e.currentTarget).get("username") ?? "").trim();
              if (username && username !== me.username) act(() => api("/api/me", { method: "PATCH", body: { username } }).then(() => ({ message: t("You're now {name}", { name: username }) })));
            }}
          >
            <input name="username" defaultValue={me.username} maxLength={20} minLength={3} pattern="[A-Za-z0-9_]+" dir="ltr" title={t("Letters, numbers and _ only (English letters)")} />
            <Button className="btn ghost small">{t("Save")}</Button>
          </form>
          <p className="small muted">{t("No account needed — your progress is saved in this browser.")}</p>
          <label>{t("Avatar")}</label>
          <div className="row wrap">
            {AVATARS.map((a) => (
              <Button
                key={a}
                className="btn ghost small"
                style={{ fontSize: 20, outline: a === me.avatar ? "2px solid var(--pink)" : undefined }}
                onClick={() => api("/api/me", { method: "PATCH", body: { avatar: a } }).then(refresh)}
              >
                {a}
              </Button>
            ))}
          </div>
          <label>{t("Invite friends — you both get {n} coins", { n: S.referralCoins })}</label>
          <div className="row">
            <input readOnly value={refLink} className="mono small" dir="ltr" onFocus={(e) => e.target.select()} />
            <Button
              className="btn cyan small"
              onClick={() => (navigator.share ? navigator.share({ title: t("Play StreetQuest with me"), url: refLink }).catch(() => {}) : navigator.clipboard.writeText(refLink))}
            >
              {t("Share")}
            </Button>
          </div>
          <p className="small muted">
            {t("Timezone: {tz} (daily reset at your local midnight)", { tz: me.timezone })}
          </p>
          <div className="row wrap" style={{ marginTop: 10 }}>
            {me.role === "ADMIN" && (
              <a className="btn yellow small" href="/admin">
                {t("Admin panel")}
              </a>
            )}

          </div>
        </>
      )}

      {tab === "quests" && <QuestsTab />}

      {tab === "bag" && <BagTab />}

      {tab === "awards" && (
        <div className="ach">
          {ACHIEVEMENTS.map((a) => (
            <div key={a.key} className={me.achievements.includes(a.key) ? "" : "locked"} title={t(a.desc)}>
              <b>{a.emoji}</b>
              {t(a.name)}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Bag (multi-select selling)
const RARITY_ORDER = { legendary: 0, epic: 1, rare: 2, common: 3 } as const;

function BagTab() {
  const { me, act } = useGame();
  const [sel, setSel] = useState<Record<string, number>>({});
  const [selecting, setSelecting] = useState(false);
  const [filter, setFilter] = useState<"all" | "food" | "common" | "rare" | "epic" | "legendary">("all");
  const price = (key: string) => Math.round((me.inventory.find((i) => i.key === key)?.def.value ?? 0) * S.sellMult);
  const items = [...me.inventory]
    .filter((i) => filter === "all" || (filter === "food" ? !!i.def.food : i.def.rarity === filter))
    .sort((a, b) => RARITY_ORDER[a.def.rarity] - RARITY_ORDER[b.def.rarity] || b.def.value - a.def.value);
  const chosen = Object.entries(sel).filter(([k, q]) => q > 0 && me.inventory.some((i) => i.key === k));
  const total = chosen.reduce((s, [k, q]) => s + price(k) * q, 0);
  const count = chosen.reduce((s, [, q]) => s + q, 0);
  const bagValue = me.inventory.reduce((s, i) => s + price(i.key) * i.qty, 0);
  const toggle = (key: string, qty: number) => setSel((s) => ({ ...s, [key]: s[key] ? 0 : qty }));
  const setQty = (key: string, q: number, max: number) => setSel((s) => ({ ...s, [key]: Math.max(0, Math.min(max, q)) }));
  // Items are tiles, not buttons: guard against a double tap opening two sell dialogs.
  const selling = useRef(false);
  const sellNow = async (list: [string, number][]) => {
    const n = list.reduce((s, [, q]) => s + q, 0);
    const coins = list.reduce((s, [k, q]) => s + price(k) * q, 0);
    if (!n || selling.current) return;
    selling.current = true;
    await askConfirm(t("Sell {n, plural, one {# item} other {# items}} for {coins} coins?", { n, coins }), { ok: t("Sell for {n} 🪙", { n: coins }), danger: true }).then(async (ok) => {
      if (!ok) return;
      const done = await act(() => api("/api/inventory", { body: { action: "sellMany", items: list.map(([itemKey, qty]) => ({ itemKey, qty })) } }));
      if (done) {
        setSel({});
        setSelecting(false);
      }
    }).finally(() => (selling.current = false));
  };

  if (!me.inventory.length) return <div className="empty">{t("🎒 Your bag is empty. Go collect something!")}</div>;
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 8, justifyContent: "space-between" }}>
        <span className="small muted">{t("{n} items · worth {coins} 🪙", { n: me.inventory.reduce((s, i) => s + i.qty, 0), coins: bagValue })}</span>
        <div className="row">
          {selecting && <Button className="btn ghost small" onClick={() => setSel(Object.fromEntries(items.map((i) => [i.key, i.qty])))}>{t("Select all")}</Button>}
          <Button className={`btn small ${selecting ? "yellow" : "ghost"}`} onClick={() => (setSelecting(!selecting), setSel({}))}>{selecting ? t("Done") : t("☑️ Select")}</Button>
        </div>
      </div>
      <div className="tabs">
        {(["all", "food", "common", "rare", "epic", "legendary"] as const).map((f) => (
          <Button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)} style={f !== "all" && f !== "food" ? { color: RARITY_COLOR[f] } : undefined}>{f === "all" ? t("All") : f === "food" ? t("🍔 Food") : t(RARITY_LABEL[f])}</Button>
        ))}
      </div>
      <p className="small muted">{selecting ? t("Tap items to pick them, adjust how many with − / +, then sell them in one go.") : t("Tap an item to sell it, or use ☑️ Select to sell many at once. Food can be eaten in Hero → Life.")}</p>
      <div className="inv">
        {items.map((i) => {
          const q = sel[i.key] ?? 0;
          return (
            <div
              key={i.key}
              className={`inv-item ${i.def.rarity} ${q ? "picked" : ""}`}
              style={{ borderColor: RARITY_COLOR[i.def.rarity] }}
              title={t(i.def.blurb)}
              onClick={() => (selecting ? toggle(i.key, i.qty) : sellNow([[i.key, 1]]))}
            >
              <span className="q">×{fmtNum(i.qty)}</span>
              {q > 0 && <span className="check">✓</span>}
              <div className="e">{i.def.emoji}</div>
              <div className="n">{t(i.def.name)}</div>
              <div className="v">{fmtNum(price(i.key))} 🪙</div>
              {selecting && q > 0 && (
                <div className="stepper" onClick={(e) => e.stopPropagation()}>
                  <Button onClick={() => setQty(i.key, q - 1, i.qty)} aria-label={t("Fewer")}>−</Button>
                  <b>{fmtNum(q)}</b>
                  <Button onClick={() => setQty(i.key, q + 1, i.qty)} aria-label={t("More")}>+</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {selecting && (
        <div className="sell-bar">
          <span className="grow">{count ? <>{t("Selected")} <b>{fmtNum(count)}</b> · <b style={{ color: "var(--yellow)" }}>{fmtNum(total)} 🪙</b></> : t("Nothing selected")}</span>
          <Button className="btn yellow" disabled={!count} onClick={() => sellNow(chosen)}>💰 {t("Sell selected")}</Button>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------- sound & music
function SoundSettings() {
  const [, force] = useState(0);
  useEffect(() => {
    const a = onMusicChange(() => force((n) => n + 1));
    const b = onMuteChange(() => force((n) => n + 1));
    return () => {
      a();
      b();
    };
  }, []);
  return (
    <>
      <label>{t("Sound")}</label>
      <div className="card sound-card">
        <div className="row">
          <span className="grow">🔊 {t("Sound effects & music")}</span>
          <Button className={`btn small ${isMuted() ? "ghost" : "green"}`} onClick={() => setMuted(!isMuted())}>{isMuted() ? t("Off") : t("On")}</Button>
        </div>
        <div className="row">
          <span className="grow">🎵 {t("Background music")}</span>
          <Button className={`btn small ${musicOn() ? "green" : "ghost"}`} disabled={isMuted()} onClick={() => setMusicOn(!musicOn())}>{musicOn() ? t("On") : t("Off")}</Button>
        </div>
        <div className="row">
          <span className="small muted" style={{ width: 70 }}>{t("Volume")}</span>
          <input type="range" min={0} max={1} step={0.05} value={musicVolume()} disabled={isMuted() || !musicOn()} onChange={(e) => setMusicVolume(Number(e.target.value))} className="grow" aria-label={t("Music volume")} />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- graphics
const PERF_MODES: [PerfMode, string][] = [
  ["auto", msg("Auto")],
  ["lite", msg("Lite")],
  ["full", msg("Full")],
];
function GraphicsSettings() {
  const [, force] = useState(0);
  useEffect(() => onPerfChange(() => force((n) => n + 1)), []);
  const mode = perfMode();
  return (
    <>
      <label>{t("Graphics")}</label>
      <div className="card sound-card">
        <div className="row">
          <span className="grow">⚡ {t("Performance mode")}</span>
          <div className="tabs" style={{ margin: 0 }}>
            {PERF_MODES.map(([m, label]) => (
              <button key={m} className={mode === m ? "on" : ""} onClick={() => setPerfMode(m)}>
                {t(label)}
              </button>
            ))}
          </div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          {t("Lite turns off looping map animations and lowers 3D fight resolution — smoother and lighter on battery and memory.")}
          {mode === "auto" && ` ${t("This phone is using {mode}.", { mode: t(autoIsLite() ? "Lite" : "Full") })}`}
        </p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- app install + notifications
function AppSettings() {
  const { act, toast } = useGame();
  const [, force] = useState(0);
  const [push, setPush] = useState<"unknown" | "on" | "off" | "blocked" | "unsupported">("unknown");
  const [busy, setBusy] = useState(false);
  useEffect(() => onPwaChange(() => force((n) => n + 1)), []);
  useEffect(() => {
    if (!pushSupported()) return setPush("unsupported");
    if (Notification.permission === "denied") return setPush("blocked");
    currentPushSub().then((s) => setPush(s ? "on" : "off")).catch(() => setPush("off"));
  }, []);
  const toggle = async () => {
    setBusy(true);
    try {
      if (push === "on") {
        await disablePush();
        setPush("off");
        toast({ title: t("🔕 Notifications off for this device") });
      } else {
        await enablePush();
        setPush("on");
        toast({ kind: "reward", title: t("🔔 Notifications on"), body: t("We'll tell you about money drops, cash-outs and your crew.") });
      }
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
      if (typeof Notification !== "undefined" && Notification.permission === "denied") setPush("blocked");
    }
    setBusy(false);
  };
  return (
    <>
      <label>{t("App")}</label>
      <div className="card sound-card">
        <div className="row">
          <span className="grow">📲 {t("Install on this phone")}<div className="small muted">{t("Full screen, home-screen icon, works offline")}</div></span>
          {isStandalone() ? (
            <span className="tag" style={{ color: "var(--green)" }}>{t("Installed ✓")}</span>
          ) : canInstall() ? (
            <Button className="btn green small" onClick={() => promptInstall()}>{t("Install")}</Button>
          ) : isIos() ? (
            <span className="small muted" style={{ maxWidth: 150, textAlign: "end" }}>{t("Safari: Share ⬆️ → Add to Home Screen")}</span>
          ) : (
            <span className="small muted" style={{ maxWidth: 150, textAlign: "end" }}>{t("Browser menu → Install app")}</span>
          )}
        </div>
        <div className="row">
          <span className="grow">🔔 {t("Notifications")}<div className="small muted">{push === "blocked" ? t("Blocked — allow them in your browser's site settings") : push === "unsupported" ? (isIos() ? t("Install the app first (iOS 16.4+)") : t("Not supported in this browser")) : t("Raids on your base, rewards, crew messages")}</div></span>
          {push === "on" || push === "off" ? (
            <Button className={`btn small ${push === "on" ? "green" : "ghost"}`} disabled={busy} onClick={toggle}>{push === "on" ? t("On") : t("Off")}</Button>
          ) : null}
        </div>
        {push === "on" && (
          <Button className="btn ghost small" onClick={() => act(() => api("/api/push", { body: { action: "test" } }))}>{t("Send a test notification")}</Button>
        )}
      </div>
    </>
  );
}
