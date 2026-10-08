"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ACHIEVEMENTS } from "@/lib/progression";
import { S } from "@/lib/settings";
import { RARITY_COLOR } from "@/lib/catalog";
import { distanceM, formatDistance, regionKey } from "@/lib/geo";
import { api, fmtTime, type LatLng, type WorldDelivery, type WorldEvent, type WorldNote } from "./client";
import { MoveIcon, Sheet, Tabs, useGame } from "./ui";
import { LifeTab } from "./Life";
import { GearTab, HeroTab, PowersTab, QuestsTab } from "./Hero";
import { askConfirm } from "@/components/Dialogs";
import { CAPTURE_SECONDS, FLAG_COST, FLAG_INCOME_HOUR } from "@/lib/flags";
import { resizePhoto } from "./photo";
import { isMuted, onMuteChange, setMuted, sfx } from "./sfx";
import { musicOn, musicVolume, onMusicChange, setMusicOn, setMusicVolume } from "./music";
import { canInstall, currentPushSub, disablePush, enablePush, isIos, isStandalone, onPwaChange, promptInstall, pushSupported } from "@/components/pwaClient";
import { Button } from "@/components/Button";
import { ModeCards } from "./LocationUi";
import { autoIsLite, onPerfChange, perfMode, setPerfMode, type PerfMode } from "@/components/perf";

const navUrl = (lat: number, lng: number) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

function LocationField({ label, value, onChange }: { label: string; value: LatLng | null; onChange: (p: LatLng) => void }) {
  const { pos, pick } = useGame();
  return (
    <>
      <label>{label}</label>
      <div className="row">
        <div className="grow small mono muted">{value ? `${value.lat.toFixed(5)}, ${value.lng.toFixed(5)}` : "not set"}</div>
        <Button type="button" className="btn ghost small" onClick={() => pos && onChange(pos)}>
          📍 Here
        </Button>
        <Button type="button" className="btn ghost small" onClick={() => pick(`Tap the map: ${label}`, onChange)}>
          🗺️ Pick
        </Button>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- Nearby
export function NearbyPanel({ onClose, peek }: { onClose: () => void; peek: boolean }) {
  const { world, pos, act, toast } = useGame();
  const [tab, setTab] = useState<"spawns" | "notes" | "flags">("spawns");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [flagName, setFlagName] = useState("");
  const [radius, setRadius] = useState(50);
  const d = (p: LatLng) => (pos ? distanceM(pos, p) : 0);

  const spawns = (world?.spawns ?? []).filter((s) => !s.claimed).sort((a, b) => d(a) - d(b));
  const phaseInfo = world && {
    night: "🌙 Night — Moon Shards & Street Crowns are out",
    dawn: "🌅 Dawn — golden hour, double XP!",
    day: "☀️ Daytime — Sun Stones are spawning",
    dusk: "🌇 Dusk — golden hour, double XP!",
  }[world.phase];

  return (
    <Sheet title="Nearby" onClose={onClose} peek={peek} help="nearby">
      {phaseInfo && <div className="card small">{phaseInfo}</div>}
      <Tabs value={tab} onChange={setTab} tabs={[["spawns", `Spawns (${spawns.length})`], ["notes", `Posts (${world?.notes.length ?? 0})`], ["flags", `🚩 Flags (${world?.flags.length ?? 0})`]]} />
      {tab === "spawns" &&
        (spawns.length ? (
          spawns.map((s) => (
            <div key={s.id} className="card list-item">
              <div className="icon-tile" style={{ boxShadow: s.item ? `inset 0 0 0 2px ${RARITY_COLOR[s.item.rarity]}` : undefined }}>
                {s.kind === "chest" ? "🧰" : s.kind === "run" ? "🏁" : s.kind === "arcade" ? "🕹️" : s.kind === "derrick" ? "🛢️" : s.item?.emoji}
              </div>
              <div className="grow">
                <b>{s.kind === "run" ? s.run!.title : s.kind === "chest" ? "Locked Chest" : s.kind === "arcade" ? "Arcade: Shooting Range" : s.kind === "derrick" ? "Oil Derrick" : s.item?.name}</b>
                <div className="small muted">
                  {formatDistance(d(s))} · +{s.rewardXp} XP {s.goldenHour && "· ✨2×"}
                </div>
              </div>
              <span className="small muted">{Math.max(0, Math.round((s.expiresAt - Date.now()) / 60000))}m</span>
            </div>
          ))
        ) : (
          <div className="empty">Nothing left nearby. Walk a few blocks or wait for the next spawn wave.</div>
        ))}
      {tab === "notes" && (
        <>
          <div className="card">
            <b>📍 Pin a post right here</b>
            <p className="small muted" style={{ margin: "4px 0 8px" }}>
              Text and/or a photo. Only players who physically come within the radius can see it. Likes earn you XP.
            </p>
            <textarea rows={2} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder="The best tacos in town are behind this wall…" />
            {photo && (
              <div className="photo-preview">
                <img src={photo} alt="Your photo" />
                <Button className="close" onClick={() => setPhoto(null)} aria-label="Remove photo">✕</Button>
              </div>
            )}
            <div className="row wrap" style={{ marginTop: 8 }}>
              <label className="btn ghost small" style={{ margin: 0 }}>
                📸 {photo ? "Change" : "Photo"}
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
                    {r} m radius
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
                Post · {photo ? 15 : 5} 🪙
              </Button>
            </div>
          </div>
          {world?.notes.map((n) => (
            <NoteCard key={n.id} n={n} dist={d(n)} />
          ))}
        </>
      )}
      {tab === "flags" && (
        <>
          <div className="card">
            <b>🚩 King of the hill</b>
            <p className="small muted" style={{ margin: "4px 0 8px" }}>
              Plant a flag where you stand ({FLAG_COST} 🪙). It pays {FLAG_INCOME_HOUR} 🪙/hour while you hold it. Rivals capture it by standing on it for {CAPTURE_SECONDS}s while nobody from your crew is there — so defend it in person!
            </p>
            <div className="row">
              <input value={flagName} onChange={(e) => setFlagName(e.target.value)} maxLength={24} placeholder="Flag name, e.g. Taco Hill" />
              <Button className="btn small" disabled={flagName.trim().length < 2} onClick={async () => (await act(() => api("/api/flags", { body: { action: "plant", name: flagName } }))) && setFlagName("")}>
                Plant
              </Button>
            </div>
            <Button className="btn yellow small" style={{ marginTop: 8 }} onClick={() => act(() => api("/api/flags", { body: { action: "collect" } }))}>
              🪙 Collect flag tribute
            </Button>
          </div>
          {(world?.flags ?? [])
            .slice()
            .sort((a, b) => d(a) - d(b))
            .map((f) => (
              <div key={f.id} className="card list-item">
                <div className="icon-tile">🚩</div>
                <div className="grow">
                  <b style={{ color: f.mine ? "var(--cyan)" : f.friend ? "var(--green)" : "var(--red)" }}>{f.name}</b>
                  <div className="small muted">
                    {f.mine ? "Yours" : `${f.ownerAvatar} ${f.owner}`} · {formatDistance(d(f))}
                    {f.capture && <span style={{ color: "var(--red)" }}> · ⚔️ being captured</span>}
                  </div>
                </div>
              </div>
            ))}
          {!world?.flags.length && <div className="empty">No flags around. Be the first — plant one at your favorite spot.</div>}
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
        {n.author.avatar} {n.author.username} · {formatDistance(dist)} away · {fmtTime(n.createdAt)}
      </div>
      {n.unlocked ? (
        <>
          {n.hasPhoto && <img className="note-photo" src={`/api/notes/${n.id}`} alt={`Photo by ${n.author.username}`} loading="lazy" />}
          {n.body && <div style={{ marginTop: 6 }}>{n.body}</div>}
          <div className="row" style={{ marginTop: 8 }}>
            <Button className="btn ghost small" disabled={n.mine} onClick={() => act(async () => { const r = await api<{ message: string; likes: number }>(`/api/notes/${n.id}`, { body: { kind: "like" } }); setLikes(r.likes); return r; })}>
              ❤️ {likes}
            </Button>
            <span className="grow" />
            {!n.mine && (
              <Button className="btn ghost small" onClick={() => askConfirm("Report this post?", { body: "Posts with several reports are hidden and reviewed by moderators.", ok: "Report", danger: true }).then((ok) => ok && act(() => api(`/api/notes/${n.id}`, { body: { kind: "report" } })))}>
                🚩
              </Button>
            )}
          </div>
        </>
      ) : (
        <div style={{ marginTop: 4 }}>
          <i className="muted">🔒 {n.hasPhoto ? "📸 A photo is pinned here." : ""} Walk within {n.radiusM} m to see it</i>
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
function GoTo({ lat, lng, label = "navigate" }: { lat: number; lng: number; label?: string }) {
  const { teleport } = useGame();
  return teleport ? (
    <a href="#" onClick={(e) => (e.preventDefault(), teleport({ lat, lng }))}><MoveIcon /> go</a>
  ) : (
    <a href={navUrl(lat, lng)} target="_blank" rel="noreferrer">{label}</a>
  );
}

function DeliveryRoute({ d }: { d: WorldDelivery }) {
  return (
    <div className="small" style={{ margin: "6px 0" }}>
      <div>
        🟢 <b>Pickup:</b> {d.pickupLabel}{" "}
        <GoTo lat={d.pickupLat} lng={d.pickupLng} />
      </div>
      <div>
        🔴 <b>Drop-off:</b> {d.dropoffLabel}{" "}
        <GoTo lat={d.dropoffLat} lng={d.dropoffLng} />
      </div>
    </div>
  );
}

export function JobsPanel({ onClose, peek }: { onClose: () => void; peek: boolean }) {
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

  const STATUS: Record<string, string> = { OPEN: "🟡 Waiting for courier", ACCEPTED: "🔵 Courier on the way", PICKED_UP: "🟣 In transit", DELIVERED: "✅ Delivered", CANCELLED: "⚫ Cancelled" };

  return (
    <Sheet title="Courier Jobs" onClose={onClose} peek={peek} help="jobs">
      <Tabs
        value={tab}
        onChange={setTab}
        tabs={[
          ["open", `Open (${world?.deliveries.length ?? 0})`],
          ["carrying", "Carrying"],
          ["sent", "My requests"],
          ["new", "+ Request"],
        ]}
      />
      {tab === "open" &&
        (world?.deliveries.length ? (
          [...world.deliveries]
            .sort((a, b) => (a.distanceM ?? 0) - (b.distanceM ?? 0))
            .map((d) => (
              <div key={d.id} className="card">
                <div className="row">
                  <b className="grow">📦 {d.title}</b>
                  <span className="tag" style={{ color: "var(--yellow)" }}>
                    {d.reward} 🪙
                  </span>
                </div>
                <div className="small muted">
                  by {d.sender?.username} · pickup {formatDistance(d.distanceM ?? 0)} away ·{" "}
                  {formatDistance(distanceM({ lat: d.pickupLat, lng: d.pickupLng }, { lat: d.dropoffLat, lng: d.dropoffLng }))} trip
                </div>
                {d.description && <p className="small">{d.description}</p>}
                <DeliveryRoute d={d} />
                <Button className="btn green small" onClick={() => doAct(d.id, "accept")}>
                  Accept job
                </Button>
              </div>
            ))
        ) : (
          <div className="empty">No open delivery requests near you.</div>
        ))}

      {tab === "carrying" &&
        (mine.carrying.length ? (
          mine.carrying.map((d) => (
            <div key={d.id} className="card">
              <div className="row">
                <b className="grow">{d.title}</b>
                <span className="tag">{STATUS[d.status]}</span>
              </div>
              <div className="small muted">for {d.sender.username} · reward {d.reward} 🪙</div>
              <DeliveryRoute d={d} />
              {d.status === "ACCEPTED" && (
                <div className="row">
                  <Button className="btn cyan small" onClick={() => doAct(d.id, "pickup")}>
                    I&apos;m at pickup
                  </Button>
                  <Button className="btn ghost small" onClick={() => doAct(d.id, "cancel")}>
                    Drop job
                  </Button>
                </div>
              )}
              {d.status === "PICKED_UP" && (
                <div className="row">
                  <input
                    className="grow"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="Handover code"
                    value={codes[d.id] ?? ""}
                    onChange={(e) => setCodes({ ...codes, [d.id]: e.target.value })}
                  />
                  <Button className="btn green small" onClick={() => doAct(d.id, "deliver", codes[d.id])}>
                    Deliver
                  </Button>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="empty">You aren&apos;t carrying anything. Grab an open job!</div>
        ))}

      {tab === "sent" &&
        (mine.sent.length ? (
          mine.sent.map((d) => (
            <div key={d.id} className="card">
              <div className="row">
                <b className="grow">{d.title}</b>
                <span className="tag">{STATUS[d.status]}</span>
              </div>
              <div className="small muted">
                Reward {d.reward} 🪙 {d.courier && `· courier: ${d.courier.username}`}
              </div>
              <DeliveryRoute d={d} />
              {d.status !== "DELIVERED" && d.status !== "CANCELLED" && (
                <div className="card hl small">
                  Handover code: <b className="mono" style={{ fontSize: 18 }}>{d.dropoffCode}</b> — give this only to the recipient.
                </div>
              )}
              {d.status === "OPEN" && (
                <Button className="btn ghost small" onClick={() => doAct(d.id, "cancel")}>
                  Cancel & refund
                </Button>
              )}
            </div>
          ))
        ) : (
          <div className="empty">You haven&apos;t requested any deliveries.</div>
        ))}

      {tab === "new" && (
        <div>
          <div className="card small">
            ⚠️ Only legal, safe items. No cash, valuables, weapons, drugs, food that can spoil or anything you wouldn&apos;t hand to a stranger.
            The reward is held in escrow and paid when the courier enters the handover code.
          </div>
          <label>What is it?</label>
          <input value={f.title} maxLength={60} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Book for my friend" />
          <label>Details (size, how to find you…)</label>
          <textarea rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <LocationField label="Pickup point" value={pickup} onChange={setPickup} />
          <input value={f.pickupLabel} onChange={(e) => setF({ ...f, pickupLabel: e.target.value })} placeholder="e.g. Café entrance, 12 Main St" style={{ marginTop: 6 }} />
          <LocationField label="Drop-off point" value={dropoff} onChange={setDropoff} />
          <input value={f.dropoffLabel} onChange={(e) => setF({ ...f, dropoffLabel: e.target.value })} placeholder="e.g. Library front desk" style={{ marginTop: 6 }} />
          <label>Reward (coins) — you have {me.coins}</label>
          <input type="number" min={10} value={f.reward} onChange={(e) => setF({ ...f, reward: Number(e.target.value) })} />
          <Button className="btn block" style={{ marginTop: 14 }} disabled={!pickup || !dropoff || f.title.length < 3} onClick={create}>
            Post request
          </Button>
        </div>
      )}
    </Sheet>
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

  // Keep the newest message in view. Scroll only the log (scrollIntoView would also move
  // the sheet/page), and use a block body: desktop Chrome's scroll methods return a
  // Promise, and an effect must never return anything but a cleanup function.
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [msgs]);

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
      <div className="chat-log" ref={log}>
        {msgs.length === 0 && <div className="empty">No messages yet. Say hi 👋</div>}
        {msgs.map((m) => (
          <div key={m.id} className={`msg ${m.author.id === me.id ? "me" : ""}`}>
            {m.author.id !== me.id && (
              <div className="who">
                {m.author.avatar} {m.author.username}
              </div>
            )}
            {m.body}
          </div>
        ))}
      </div>
      <form className="row" onSubmit={send} style={{ paddingTop: 8 }}>
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Message…" />
        <Button className="btn small">Send</Button>
      </form>
    </div>
  );
}

export function CrewPanel({ onClose, peek, chat, setChat }: { onClose: () => void; peek: boolean; chat: { room: string; label: string } | null; setChat: (c: { room: string; label: string } | null) => void }) {
  const { act, pos, me } = useGame();
  const [tab, setTab] = useState<"friends" | "chat" | "ranks" | "wanted">(chat ? "chat" : "friends");
  const [wanted, setWanted] = useState<{ id: string; username: string; avatar: string; amount: number }[] | null>(null);
  const [data, setData] = useState<{ friends: Friend[]; incoming: Friend[]; outgoing: Friend[] }>({ friends: [], incoming: [], outgoing: [] });
  const [name, setName] = useState("");
  const [scope, setScope] = useState<"global" | "friends">("global");
  const [by, setBy] = useState<"xp" | "trophies">("trophies");
  const [board, setBoard] = useState<{ top: { id: string; username: string; avatar: string; level: number; xp: number; trophies: number; league: { emoji: string }; me: boolean }[]; myRank: number } | null>(null);
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
    if (tab === "wanted") api<{ wanted: NonNullable<typeof wanted> }>("/api/bounties").then((r) => setWanted(r.wanted)).catch(() => {});
    if (tab === "ranks") api<NonNullable<typeof board>>(`/api/leaderboard?scope=${scope}&by=${by}`).then(setBoard).catch(() => {});
  }, [tab, scope, by]);

  const fr = async (body: object) => (await act(() => api("/api/friends", { body }))) && load();
  const dm = (f: Friend) => setChat({ room: `dm:${[me.id, f.id].sort().join(":")}`, label: `${f.avatar} ${f.username}` });

  const rooms: { room: string; label: string }[] = [
    { room: "global", label: "🌍 Global" },
    ...(pos ? [{ room: `local:${regionKey(pos)}`, label: "📡 Local" }] : []),
    ...events.map((e) => ({ room: `event:${e.id}`, label: `🎉 ${e.title}` })),
    ...data.friends.map((f) => ({ room: `dm:${[me.id, f.id].sort().join(":")}`, label: `${f.avatar} ${f.username}` })),
  ];
  const active = chat ?? rooms[0];

  return (
    <Sheet title="Crew" onClose={onClose} peek={peek} help="crew">
      <Tabs value={tab} onChange={setTab} tabs={[["friends", `Friends${data.incoming.length ? ` (${data.incoming.length})` : ""}`], ["chat", "Chat"], ["ranks", "Ranks"], ["wanted", "💀 Wanted"]]} />

      {tab === "wanted" && (
        <>
          <p className="small muted">Most wanted commanders. Down one in the street (🔫), with towers or a superweapon to collect the whole bounty. Put a price on someone from their card on the map.</p>
          {wanted?.map((w, i) => (
            <div key={w.id} className="card list-item">
              <div className="icon-tile">{i === 0 ? "👑" : w.avatar}</div>
              <b className="grow">{w.username}</b>
              <span className="tag" style={{ color: "var(--yellow)" }}>💀 {w.amount.toLocaleString()} 🪙</span>
            </div>
          ))}
          {wanted && !wanted.length && <div className="empty">Nobody is wanted right now. Peace… for now.</div>}
        </>
      )}

      {tab === "friends" && (
        <>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              fr({ action: "request", username: name }).then(() => setName(""));
            }}
          >
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Add by player name" />
            <Button className="btn small" disabled={!name.trim()}>
              Add
            </Button>
          </form>
          {data.incoming.length > 0 && <h3 style={{ fontSize: 14, margin: "14px 0 8px" }}>Requests</h3>}
          {data.incoming.map((f) => (
            <div key={f.friendshipId} className="card list-item">
              <div className="icon-tile">{f.avatar}</div>
              <b className="grow">{f.username}</b>
              <Button className="btn green small" onClick={() => fr({ action: "accept", friendshipId: f.friendshipId })}>
                ✓
              </Button>
              <Button className="btn ghost small" onClick={() => fr({ action: "decline", friendshipId: f.friendshipId })}>
                ✕
              </Button>
            </div>
          ))}
          <h3 style={{ fontSize: 14, margin: "14px 0 8px" }}>
            Friends · {data.friends.filter((f) => f.online).length} online
          </h3>
          {data.friends.length === 0 && <div className="empty">No crew yet. Add players you meet on the map!</div>}
          {[...data.friends]
            .sort((a, b) => Number(b.online) - Number(a.online))
            .map((f) => (
              <div key={f.friendshipId} className="card list-item">
                <div className="icon-tile">{f.avatar}</div>
                <div className="grow">
                  <b>{f.username}</b> <span className="small muted">Lv {f.level}</span>
                  <div className="small muted">
                    <span className={`dot ${f.online ? "on" : ""}`} /> {f.online ? "Online" : f.lastSeenAt ? `Seen ${fmtTime(f.lastSeenAt)}` : "Offline"}
                  </div>
                </div>
                <Button className="btn cyan small" onClick={() => dm(f)}>
                  💬
                </Button>
                <Button className="btn ghost small" onClick={() => askConfirm(`Remove ${f.username}?`, { ok: "Remove", danger: true }).then((ok) => ok && fr({ action: "remove", friendshipId: f.friendshipId }))}>
                  ✕
                </Button>
              </div>
            ))}
          {data.outgoing.length > 0 && <p className="small muted">Pending: {data.outgoing.map((f) => f.username).join(", ")}</p>}
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
          <Tabs value={scope} onChange={setScope} tabs={[["global", "🌍 World"], ["friends", "🤝 Crew"]]} />
          <Tabs value={by} onChange={setBy} tabs={[["trophies", "🏆 Trophies"], ["xp", "⭐ XP"]]} />
          {board && <p className="small muted">Your rank: #{board.myRank}</p>}
          {board?.top.map((p, i) => (
            <div key={p.id} className={`card list-item ${p.me ? "hl" : ""}`}>
              <b style={{ width: 28, fontFamily: "var(--display)", color: i < 3 ? "var(--yellow)" : undefined }}>{i + 1}</b>
              <span style={{ fontSize: 22 }}>{p.avatar}</span>
              <b className="grow">{p.username}</b>
              <span className="small muted">Lv {p.level}</span>
              <span className="small">{by === "trophies" ? `${p.league.emoji} ${p.trophies} 🏆` : `${p.xp.toLocaleString()} XP`}</span>
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
          <b className="grow">
            {e.official ? "⭐" : "🎉"} {e.title}
          </b>
          {live && <span className="tag" style={{ color: "var(--green)" }}>LIVE</span>}
        </div>
        <div className="small muted">
          {fmtTime(e.startsAt)} – {fmtTime(e.endsAt)} · {e.participants}/{e.maxPlayers} going {pos && `· ${formatDistance(distanceM(pos, e))}`}
        </div>
        {e.description && <p className="small">{e.description}</p>}
        <div className="row wrap">
          {!j && (
            <Button className="btn small" onClick={() => evAct(e.id, "join")}>
              Join
            </Button>
          )}
          {j && !j.checkedIn && live && (
            <Button className="btn green small" onClick={() => evAct(e.id, "checkin")}>
              Check in
            </Button>
          )}
          {j?.checkedIn && <span className="tag" style={{ color: "var(--green)" }}>✓ Checked in</span>}
          {j && (
            <Button className="btn cyan small" onClick={() => openChat(`event:${e.id}`, `🎉 ${e.title}`)}>
              Squad chat
            </Button>
          )}
          <a className="btn ghost small" href={navUrl(e.lat, e.lng)} target="_blank" rel="noreferrer">
            Navigate
          </a>
          <Button
            className="btn ghost small"
            onClick={() => {
              const url = `${location.origin}/e/${e.slug}`;
              if (navigator.share) navigator.share({ title: e.title, url }).catch(() => {});
              else navigator.clipboard.writeText(url);
            }}
          >
            Share
          </Button>
        </div>
      </div>
    );
  };

  return (
    <Sheet title="Events" onClose={onClose} peek={peek} help="events">
      <Tabs value={tab} onChange={setTab} tabs={[["nearby", "Nearby"], ["mine", `My events (${mine.length})`], ["new", "+ Create"]]} />
      {tab === "nearby" && (world?.events.length ? world.events.map(card) : <div className="empty">No events within 8 km. Start one!</div>)}
      {tab === "mine" && (mine.length ? mine.map(card) : <div className="empty">You haven&apos;t joined any events.</div>)}
      {tab === "new" && (
        <div>
          <label>Title</label>
          <input value={f.title} maxLength={80} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Saturday night chest hunt" />
          <label>Description</label>
          <textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Meet at the fountain, we sweep downtown together." />
          <LocationField label="Meeting point" value={loc} onChange={setLoc} />
          <div className="form-grid">
            <div>
              <label>Starts (your local time)</label>
              <input type="datetime-local" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
            </div>
            <div>
              <label>Duration (hours)</label>
              <input type="number" min={1} max={24} value={f.hours} onChange={(e) => setF({ ...f, hours: Number(e.target.value) })} />
            </div>
            <div>
              <label>Max players</label>
              <input type="number" min={2} value={f.maxPlayers} onChange={(e) => setF({ ...f, maxPlayers: Number(e.target.value) })} />
            </div>
          </div>
          <label className="row" style={{ textTransform: "none" }}>
            <input type="checkbox" checked={f.isPublic} onChange={(e) => setF({ ...f, isPublic: e.target.checked })} style={{ width: "auto" }} />
            Public (listed on the map & website)
          </label>
          <p className="small muted">Checked-in players get a squad bonus: +10% XP for every other player who shows up.</p>
          <Button className="btn block" disabled={!loc || !f.start || f.title.length < 3} onClick={create}>
            Create event
          </Button>
        </div>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- Profile
const AVATARS = ["🕶️", "😎", "🦊", "🐺", "🐯", "🤖", "👽", "🥷", "🧛", "🦸", "🐉", "💀"];

export type HeroTabId = "hero" | "gear" | "quests" | "powers" | "life" | "bag" | "awards" | "stats";
export function ProfilePanel({ onClose, peek, initialTab = "hero" }: { onClose: () => void; peek: boolean; initialTab?: HeroTabId }) {
  const { me, act, refresh, setHomeMode, startTour } = useGame();
  const [tab, setTab] = useState<HeroTabId>(initialTab);
  const refLink = typeof window !== "undefined" ? `${location.origin}/?ref=${me.referralCode}` : "";

  return (
    <Sheet title="Hero" onClose={onClose} peek={peek} help="hero">
      {tab !== "hero" && <div className="row" style={{ marginBottom: 12 }}>
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
            {me.xp.toLocaleString()} / {me.nextLevelXp.toLocaleString()} XP
          </div>
        </div>
      </div>}

      {me.dailyAvailable && (
        <div className="card hl row">
          <div className="grow">
            <b>🎁 Daily drop ready</b>
            <div className="small muted">
              Streak {me.streak} → +{me.dailyReward.coins} coins, +{me.dailyReward.xp} XP{me.dailyReward.gems ? `, +${me.dailyReward.gems} 💎` : ""}
            </div>
          </div>
          <Button className="btn yellow small" onClick={() => act(() => api("/api/daily", { body: {} }))}>
            Claim
          </Button>
        </div>
      )}

      <div className="res-bar">
        <span>{me.league.emoji} {me.trophies} 🏆</span>
        <span>💎 {me.gems}</span>
        <span>🔩 {me.scrap}</span>
        <span>🪙 {me.coins.toLocaleString()}</span>
      </div>

      <Tabs value={tab} onChange={setTab} tabs={[["hero", `🦸 Hero${me.freePoints ? ` (${me.freePoints})` : ""}`], ["gear", "🎒 Gear"], ["quests", `📜 Quests${me.questsReady ? ` (${me.questsReady})` : ""}`], ["powers", `⭐ Powers${me.commandPoints ? ` (${me.commandPoints})` : ""}`], ["life", `${me.mood.emoji} Life`], ["stats", "⚙️ Profile"], ["bag", `Bag (${me.inventory.reduce((s, i) => s + i.qty, 0)})`], ["awards", `Awards (${me.achievements.length})`]]} />

      {tab === "stats" && (
        <>
          <label>Play mode</label>
          <ModeCards home={!!me.remotePlay} homeLocked={!S.remoteEnabled} onPick={(h) => h !== !!me.remotePlay && setHomeMode(h)} />
          <p className="small muted">The percentage is how much XP and coins you earn. Sprints and walking goals need real walking.</p>
          <AppSettings />
          <SoundSettings />
          <GraphicsSettings />
          <div className="row wrap" style={{ marginTop: 8 }}>
            <Button className="btn cyan small" onClick={startTour}>📖 Replay tutorial</Button>
            <Button className="btn ghost small" onClick={() => { try { Object.keys(localStorage).filter((k) => k.startsWith("sq_help_")).forEach((k) => localStorage.removeItem(k)); } catch {} }}>💡 Show all tips again</Button>
          </div>
          <div className="grid3">
            <div className="stat"><b>{me.coins.toLocaleString()}</b><span>Coins</span></div>
            <div className="stat"><b>🔥 {me.streak}</b><span>Streak</span></div>
            <div className="stat"><b>{me.achievements.length}</b><span>Awards</span></div>
          </div>
          <label>Callsign</label>
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              const username = String(new FormData(e.currentTarget).get("username") ?? "").trim();
              if (username && username !== me.username) act(() => api("/api/me", { method: "PATCH", body: { username } }).then(() => ({ message: `You're now ${username}` })));
            }}
          >
            <input name="username" defaultValue={me.username} maxLength={20} minLength={3} pattern="[A-Za-z0-9_]+" />
            <Button className="btn ghost small">Save</Button>
          </form>
          <p className="small muted">No account needed — your progress is saved in this browser.</p>
          <label>Avatar</label>
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
          <label>Invite friends — you both get 150 coins</label>
          <div className="row">
            <input readOnly value={refLink} className="mono small" onFocus={(e) => e.target.select()} />
            <Button
              className="btn cyan small"
              onClick={() => (navigator.share ? navigator.share({ title: "Play StreetQuest with me", url: refLink }).catch(() => {}) : navigator.clipboard.writeText(refLink))}
            >
              Share
            </Button>
          </div>
          <p className="small muted">
            Timezone: {me.timezone} (daily reset at your local midnight)
          </p>
          <div className="row wrap" style={{ marginTop: 10 }}>
            {me.role === "ADMIN" && (
              <a className="btn yellow small" href="/admin">
                Admin panel
              </a>
            )}

          </div>
        </>
      )}

      {tab === "life" && <LifeTab />}
      {tab === "hero" && <HeroTab onTab={setTab} />}
      {tab === "gear" && <GearTab />}
      {tab === "quests" && <QuestsTab />}
      {tab === "powers" && <PowersTab />}

      {tab === "bag" && <BagTab />}

      {tab === "awards" && (
        <div className="ach">
          {ACHIEVEMENTS.map((a) => (
            <div key={a.key} className={me.achievements.includes(a.key) ? "" : "locked"} title={a.desc}>
              <b>{a.emoji}</b>
              {a.name}
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
    await askConfirm(`Sell ${n} item${n > 1 ? "s" : ""} for ${coins.toLocaleString()} coins?`, { ok: `Sell for ${coins.toLocaleString()} 🪙`, danger: true }).then(async (ok) => {
      if (!ok) return;
      const done = await act(() => api("/api/inventory", { body: { action: "sellMany", items: list.map(([itemKey, qty]) => ({ itemKey, qty })) } }));
      if (done) {
        setSel({});
        setSelecting(false);
      }
    }).finally(() => (selling.current = false));
  };

  if (!me.inventory.length) return <div className="empty">🎒 Your bag is empty. Go collect something!</div>;
  return (
    <>
      <div className="row wrap" style={{ marginBottom: 8, justifyContent: "space-between" }}>
        <span className="small muted">{me.inventory.reduce((s, i) => s + i.qty, 0)} items · worth {bagValue.toLocaleString()} 🪙</span>
        <div className="row">
          {selecting && <Button className="btn ghost small" onClick={() => setSel(Object.fromEntries(items.map((i) => [i.key, i.qty])))}>Select all</Button>}
          <Button className={`btn small ${selecting ? "yellow" : "ghost"}`} onClick={() => (setSelecting(!selecting), setSel({}))}>{selecting ? "Done" : "☑️ Select"}</Button>
        </div>
      </div>
      <div className="tabs">
        {(["all", "food", "common", "rare", "epic", "legendary"] as const).map((f) => (
          <Button key={f} className={filter === f ? "on" : ""} onClick={() => setFilter(f)} style={f !== "all" && f !== "food" ? { color: RARITY_COLOR[f] } : undefined}>{f === "all" ? "All" : f === "food" ? "🍔 Food" : f}</Button>
        ))}
      </div>
      <p className="small muted">{selecting ? "Tap items to pick them, adjust how many with − / +, then sell them in one go." : "Tap an item to sell it, or use ☑️ Select to sell many at once. Food can be eaten in Hero → Life."}</p>
      <div className="inv">
        {items.map((i) => {
          const q = sel[i.key] ?? 0;
          return (
            <div
              key={i.key}
              className={`inv-item ${i.def.rarity} ${q ? "picked" : ""}`}
              style={{ borderColor: RARITY_COLOR[i.def.rarity] }}
              title={i.def.blurb}
              onClick={() => (selecting ? toggle(i.key, i.qty) : sellNow([[i.key, 1]]))}
            >
              <span className="q">×{i.qty}</span>
              {q > 0 && <span className="check">✓</span>}
              <div className="e">{i.def.emoji}</div>
              <div className="n">{i.def.name}</div>
              <div className="v">{price(i.key)} 🪙</div>
              {selecting && q > 0 && (
                <div className="stepper" onClick={(e) => e.stopPropagation()}>
                  <Button onClick={() => setQty(i.key, q - 1, i.qty)}>−</Button>
                  <b>{q}</b>
                  <Button onClick={() => setQty(i.key, q + 1, i.qty)}>+</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {selecting && (
        <div className="sell-bar">
          <span className="grow">{count ? <>Selected <b>{count}</b> · <b style={{ color: "var(--yellow)" }}>{total.toLocaleString()} 🪙</b></> : "Nothing selected"}</span>
          <Button className="btn yellow" disabled={!count} onClick={() => sellNow(chosen)}>💰 Sell selected</Button>
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
      <label>Sound</label>
      <div className="card sound-card">
        <div className="row">
          <span className="grow">🔊 Sound effects &amp; music</span>
          <Button className={`btn small ${isMuted() ? "ghost" : "green"}`} onClick={() => setMuted(!isMuted())}>{isMuted() ? "Off" : "On"}</Button>
        </div>
        <div className="row">
          <span className="grow">🎵 Background music</span>
          <Button className={`btn small ${musicOn() ? "green" : "ghost"}`} disabled={isMuted()} onClick={() => setMusicOn(!musicOn())}>{musicOn() ? "On" : "Off"}</Button>
        </div>
        <div className="row">
          <span className="small muted" style={{ width: 70 }}>Volume</span>
          <input type="range" min={0} max={1} step={0.05} value={musicVolume()} disabled={isMuted() || !musicOn()} onChange={(e) => setMusicVolume(Number(e.target.value))} className="grow" aria-label="Music volume" />
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- graphics
const PERF_MODES: [PerfMode, string][] = [
  ["auto", "Auto"],
  ["lite", "Lite"],
  ["full", "Full"],
];
function GraphicsSettings() {
  const [, force] = useState(0);
  useEffect(() => onPerfChange(() => force((n) => n + 1)), []);
  const mode = perfMode();
  return (
    <>
      <label>Graphics</label>
      <div className="card sound-card">
        <div className="row">
          <span className="grow">⚡ Performance mode</span>
          <div className="tabs" style={{ margin: 0 }}>
            {PERF_MODES.map(([m, label]) => (
              <button key={m} className={mode === m ? "on" : ""} onClick={() => setPerfMode(m)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="small muted" style={{ margin: 0 }}>
          Lite turns off looping map animations and lowers 3D fight resolution — smoother and lighter on battery and memory.
          {mode === "auto" && ` This phone is using ${autoIsLite() ? "Lite" : "Full"}.`}
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
        toast({ title: "🔕 Notifications off for this device" });
      } else {
        await enablePush();
        setPush("on");
        toast({ kind: "reward", title: "🔔 Notifications on", body: "We'll tell you about raids, rewards and your crew." });
      }
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
      if (typeof Notification !== "undefined" && Notification.permission === "denied") setPush("blocked");
    }
    setBusy(false);
  };
  return (
    <>
      <label>App</label>
      <div className="card sound-card">
        <div className="row">
          <span className="grow">📲 Install on this phone<div className="small muted">Full screen, home-screen icon, works offline</div></span>
          {isStandalone() ? (
            <span className="tag" style={{ color: "var(--green)" }}>Installed ✓</span>
          ) : canInstall() ? (
            <Button className="btn green small" onClick={() => promptInstall()}>Install</Button>
          ) : isIos() ? (
            <span className="small muted" style={{ maxWidth: 150, textAlign: "right" }}>Safari: Share ⬆️ → Add to Home Screen</span>
          ) : (
            <span className="small muted" style={{ maxWidth: 150, textAlign: "right" }}>Browser menu → Install app</span>
          )}
        </div>
        <div className="row">
          <span className="grow">🔔 Notifications<div className="small muted">{push === "blocked" ? "Blocked — allow them in your browser's site settings" : push === "unsupported" ? (isIos() ? "Install the app first (iOS 16.4+)" : "Not supported in this browser") : "Raids on your base, rewards, crew messages"}</div></span>
          {push === "on" || push === "off" ? (
            <Button className={`btn small ${push === "on" ? "green" : "ghost"}`} disabled={busy} onClick={toggle}>{push === "on" ? "On" : "Off"}</Button>
          ) : null}
        </div>
        {push === "on" && (
          <Button className="btn ghost small" onClick={() => act(() => api("/api/push", { body: { action: "test" } }))}>Send a test notification</Button>
        )}
      </div>
    </>
  );
}
