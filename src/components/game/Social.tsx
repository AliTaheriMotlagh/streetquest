"use client";
// The social network: a feed of what players around you and the people you follow
// are up to — posts, photos, check-ins at real places, deliveries and store visits —
// plus profiles, follows, likes and comments. Crew chat lives one tap away.
import { useCallback, useEffect, useRef, useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { formatDistance } from "@/lib/geo";
import { PLACE_CATS, type PlaceCat } from "@/lib/places";
import { askConfirm } from "@/components/Dialogs";
import { Button } from "@/components/Button";
import type { PostView } from "@/server/social";
import { api, fmtTime } from "./client";
import { resizePhoto } from "./photo";
import { sfx } from "./sfx";
import { MoveIcon, Sheet, useGame } from "./ui";

type Tab = "following" | "nearby" | "trending" | "people";
type Promoted = { businessId: string; name: string; emoji: string; category: string; lat: number; lng: number; distanceM: number; campaign: { id: string; title: string; offer: string; rewardCoins: number } };
type Profile = {
  id: string; username: string; avatar: string; bio: string; level: number; faction: string | null; memberSince: string;
  followers: number; following: number; posts: number; isFollowing: boolean; followsYou: boolean; me: boolean;
  stats: { walkedM: number; steps: number; visits: number; deliveries: number };
};
type Person = { id: string; username: string; avatar: string; level: number; followers?: number; distanceM?: number | null; reason?: string };

const catEmoji = (c: string | null) => (c ? PLACE_CATS[c as PlaceCat]?.emoji ?? "📍" : "📍");

export function SocialPanel({ onClose, peek, profileId, onProfileShown }: { onClose: () => void; peek: boolean; profileId?: string | null; onProfileShown?: () => void }) {
  const { setPanel } = useGame();
  const [tab, setTab] = useState<Tab>("following");
  const [profile, setProfile] = useState<string | null>(profileId ?? null);
  useEffect(() => {
    if (profileId) (setProfile(profileId), onProfileShown?.());
  }, [profileId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Sheet
      title={profile ? t("Profile") : t("Social")}
      onClose={onClose}
      peek={peek}
      help="social"
      tall
      actions={profile ? <button className="close back-btn" onClick={() => setProfile(null)} aria-label={t("Back")}>‹</button> : <button className="close" onClick={() => setPanel("crew")} title={t("Crew & chat")} aria-label={t("Crew & chat")}>💬</button>}
    >
      {profile ? (
        <ProfileView key={profile} id={profile} onOpen={setProfile} />
      ) : (
        <>
          <div className="seg seg4" role="tablist">
            {(
              [
                ["following", "🏠", t("Feed")],
                ["nearby", "📍", t("Nearby")],
                ["trending", "🔥", t("Trending")],
                ["people", "👥", t("People")],
              ] as const
            ).map(([k, ic, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
                {ic} {label}
              </button>
            ))}
          </div>
          {tab === "people" ? <People onOpen={setProfile} /> : <Feed key={tab} tab={tab} onOpen={setProfile} />}
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------- feed
function Feed({ tab, onOpen }: { tab: Exclude<Tab, "people">; onOpen: (id: string) => void }) {
  const { pos } = useGame();
  const [posts, setPosts] = useState<PostView[] | null>(null);
  const [promoted, setPromoted] = useState<Promoted[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const at = pos ? `&lat=${pos.lat.toFixed(4)}&lng=${pos.lng.toFixed(4)}` : "";
  const load = useCallback(() => {
    api<{ posts: PostView[]; next: string | null; promoted: Promoted[] }>(`/api/social?tab=${tab}${at}`)
      .then((r) => (setPosts(r.posts), setNext(r.next), setPromoted(r.promoted ?? []), setError(null)))
      .catch((e) => setError((e as Error).message));
  }, [tab, at]);
  useEffect(() => {
    load();
  }, [tab]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadMore = () => {
    if (!next) return;
    setMore(true);
    api<{ posts: PostView[]; next: string | null }>(`/api/social?tab=${tab}&before=${encodeURIComponent(next)}${at}`)
      .then((r) => (setPosts((p) => [...(p ?? []), ...r.posts]), setNext(r.next)))
      .finally(() => setMore(false));
  };
  return (
    <>
      {tab !== "trending" && <Composer onPosted={load} />}
      {promoted.map((p) => <PromotedCard key={p.campaign.id} p={p} />)}
      {error && <p className="small" style={{ color: "var(--red)" }}>{error}</p>}
      {!posts && !error && <div className="feed-skeleton" aria-hidden><i /><i /><i /></div>}
      {posts?.length === 0 && (
        <div className="empty-feed">
          <div style={{ fontSize: 46 }}>{tab === "following" ? "👋" : tab === "nearby" ? "🗺️" : "🔥"}</div>
          <b>{tab === "following" ? t("Your feed is quiet") : tab === "nearby" ? t("Nothing posted around here yet") : t("Nothing trending yet")}</b>
          <p className="small muted">{tab === "following" ? t("Follow players from People, or post the first thing yourself.") : t("Be the first: check in at a café, shop or park near you.")}</p>
        </div>
      )}
      {posts?.map((p) => (
        <PostCard key={p.id} p={p} onOpen={onOpen} onGone={() => setPosts((list) => list?.filter((x) => x.id !== p.id) ?? null)} />
      ))}
      {next && <Button className="btn ghost block" disabled={more} onClick={loadMore}>{more ? t("Loading…") : t("Show more")}</Button>}
    </>
  );
}

function Composer({ onPosted }: { onPosted: () => void }) {
  const { me, act, toast } = useGame();
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [checkin, setCheckin] = useState(false);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const pick = async (f: File | undefined) => {
    if (!f) return;
    try {
      setPhoto(await resizePhoto(f));
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    }
  };
  const send = async () => {
    setBusy(true);
    const ok = await act(() => api("/api/social", { body: { action: "post", body: text, photo: photo ?? undefined, checkin } }));
    setBusy(false);
    if (ok) {
      sfx("reward");
      setText("");
      setPhoto(null);
      setCheckin(false);
      onPosted();
    }
  };
  return (
    <div className="composer card">
      <div className="row" style={{ alignItems: "flex-start" }}>
        <div className="avatar-sm">{me.avatar}</div>
        <textarea className="input grow" rows={text ? 3 : 1} maxLength={500} placeholder={t("What's happening around you?")} value={text} onChange={(e) => setText(e.target.value)} />
      </div>
      {photo && (
        <div className="composer-photo">
          <img src={photo} alt="" />
          <button className="close" onClick={() => setPhoto(null)} aria-label={t("Remove photo")}>✕</button>
        </div>
      )}
      <div className="row composer-actions">
        <button className="chip small" onClick={() => file.current?.click()}>📷 {t("Photo")}</button>
        <button className={`chip small ${checkin ? "on" : ""}`} aria-pressed={checkin} onClick={() => setCheckin(!checkin)} title={t("Tag the real place you're at")}>📍 {t("Check in")}</button>
        <span className="grow" />
        <Button className="btn yellow small" disabled={busy || (!text.trim() && !photo && !checkin)} onClick={send}>{t("Post")}</Button>
      </div>
      <input ref={file} type="file" accept="image/*" hidden onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
    </div>
  );
}

function PromotedCard({ p }: { p: Promoted }) {
  const { teleport, drive } = useGame();
  return (
    <div className="card promoted">
      <div className="small muted">⭐ {t("Sponsored · {d} away", { d: formatDistance(p.distanceM) })}</div>
      <div className="row">
        <div className="icon-tile">{p.emoji}</div>
        <div className="grow">
          <b>{p.name}</b>
          <div className="small">🎯 {p.campaign.title}{p.campaign.offer ? ` · 🎟️ ${p.campaign.offer}` : ""}</div>
        </div>
        <span className="tag" style={{ color: "var(--yellow)" }}>+{fmtNum(p.campaign.rewardCoins)} 🪙</span>
      </div>
      <div className="row">
        {teleport && <Button className="btn yellow small grow" onClick={() => teleport(p)}><MoveIcon /> {t("Go there")}</Button>}
        {drive && <Button className="btn cyan small grow" onClick={() => drive(p)}>🚗 {t("Drive there")}</Button>}
      </div>
    </div>
  );
}

/** A moment the game posted (delivery, check-in, store visit): translated for every reader. */
function autoText(p: PostView) {
  if (!p.auto) return "";
  return t(p.auto.t, p.auto.v ?? {});
}

export function PostCard({ p, onOpen, onGone }: { p: PostView; onOpen: (id: string) => void; onGone: () => void }) {
  const { act } = useGame();
  const [liked, setLiked] = useState(p.liked);
  const [likes, setLikes] = useState(p.likes);
  const [comments, setComments] = useState(p.comments);
  const [open, setOpen] = useState(false);
  const [pop, setPop] = useState(false);
  const toggleLike = () => {
    const on = !liked;
    setLiked(on);
    setLikes((n) => n + (on ? 1 : -1));
    if (on) (setPop(true), setTimeout(() => setPop(false), 500), sfx("tap"));
    api<{ likes: number }>("/api/social", { body: { action: "like", postId: p.id, on } }).then((r) => setLikes(r.likes)).catch(() => (setLiked(!on), setLikes((n) => n + (on ? -1 : 1))));
  };
  const menu = async () => {
    if (p.mine) {
      if (await askConfirm(t("Delete this post?"), { ok: t("Delete"), danger: true })) act(() => api("/api/social", { body: { action: "delete", postId: p.id } })).then((ok) => ok && onGone());
    } else if (await askConfirm(t("Report this post?"), { body: t("Posts with several reports are hidden until a moderator looks at them."), ok: t("Report"), danger: true })) {
      act(() => api("/api/social", { body: { action: "report", postId: p.id } })).then((ok) => ok && onGone());
    }
  };
  const auto = !!p.auto;
  return (
    <article className={`post card ${auto ? "auto" : ""} kind-${p.kind}`}>
      <header className="row">
        <button className="avatar-sm" onClick={() => onOpen(p.author.id)} aria-label={p.author.username}>{p.author.avatar}</button>
        <div className="grow post-who">
          <button className="link" onClick={() => onOpen(p.author.id)}><b>{p.author.username}</b></button> <span className="lvl-pill">{fmtNum(p.author.level)}</span>
          <div className="small muted">
            {fmtTime(p.createdAt)}
            {p.place && <> · <span className="place-chip">{catEmoji(p.place.cat)} {p.place.name}</span></>}
            {p.distanceM != null && !p.place && <> · {formatDistance(p.distanceM)}</>}
          </div>
        </div>
        <button className="close" onClick={menu} aria-label={p.mine ? t("Delete") : t("Report")} title={p.mine ? t("Delete") : t("Report")}>⋯</button>
      </header>
      {auto ? <p className="auto-line">{autoText(p)}</p> : p.body && <p className="post-body" dir="auto">{p.body}</p>}
      {p.hasPhoto && <img className="post-photo" src={`/post-img/${p.id}`} alt="" loading="lazy" onDoubleClick={() => !liked && toggleLike()} />}
      <footer className="row post-actions">
        <button className={`act ${liked ? "on" : ""} ${pop ? "pop" : ""}`} onClick={toggleLike} aria-pressed={liked} aria-label={t("Like")}>{liked ? "❤️" : "🤍"} {fmtNum(likes)}</button>
        <button className="act" onClick={() => setOpen(!open)} aria-expanded={open} aria-label={t("Comments")}>💬 {fmtNum(comments)}</button>
      </footer>
      {open && <Comments postId={p.id} onCount={setComments} />}
    </article>
  );
}

function Comments({ postId, onCount }: { postId: string; onCount: (n: number) => void }) {
  const { act } = useGame();
  const [list, setList] = useState<{ id: string; body: string; createdAt: string; mine: boolean; author: { id: string; username: string; avatar: string } }[] | null>(null);
  const [text, setText] = useState("");
  const load = useCallback(() => api<{ comments: NonNullable<typeof list> }>(`/api/social?view=comments&postId=${postId}`).then((r) => (setList(r.comments), onCount(r.comments.length))).catch(() => {}), [postId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    load();
  }, [load]);
  const send = async () => {
    if (!text.trim()) return;
    if (await act(() => api("/api/social", { body: { action: "comment", postId, body: text } }))) (setText(""), load());
  };
  return (
    <div className="comments">
      {list?.map((c) => (
        <div key={c.id} className="comment">
          <span className="avatar-xs">{c.author.avatar}</span>
          <div className="grow"><b className="small">{c.author.username}</b> <span className="small" dir="auto">{c.body}</span></div>
          {c.mine && <button className="close tiny" onClick={() => act(() => api("/api/social", { body: { action: "uncomment", commentId: c.id } })).then((ok) => void (ok && load()))} aria-label={t("Delete")}>✕</button>}
        </div>
      ))}
      <div className="row">
        <input className="input grow" maxLength={300} placeholder={t("Add a comment…")} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()} />
        <Button className="btn small" disabled={!text.trim()} onClick={send}>{t("Send")}</Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- people & profiles
function FollowButton({ id, following, onChange, small }: { id: string; following: boolean; onChange: (on: boolean) => void; small?: boolean }) {
  const { act } = useGame();
  return (
    <Button className={`btn ${following ? "ghost" : "cyan"} ${small ? "small" : ""}`} onClick={() => act(() => api("/api/social", { body: { action: "follow", userId: id, on: !following } })).then((ok) => ok && onChange(!following))}>
      {following ? t("Following") : t("➕ Follow")}
    </Button>
  );
}

function People({ onOpen }: { onOpen: (id: string) => void }) {
  const { pos } = useGame();
  const [people, setPeople] = useState<Person[] | null>(null);
  const [followed, setFollowed] = useState<Record<string, boolean>>({});
  useEffect(() => {
    api<{ people: Person[] }>(`/api/social?view=people${pos ? `&lat=${pos.lat.toFixed(3)}&lng=${pos.lng.toFixed(3)}` : ""}`).then((r) => setPeople(r.people)).catch(() => setPeople([]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!people) return <div className="feed-skeleton" aria-hidden><i /><i /></div>;
  if (!people.length) return <p className="small muted">{t("No one to suggest yet — play a little, and players near you will show up here.")}</p>;
  return (
    <>
      <p className="small muted">{t("Players around you and the city's most followed.")}</p>
      {people.map((p) => (
        <div key={p.id} className="card list-item person">
          <button className="avatar-sm" onClick={() => onOpen(p.id)}>{p.avatar}</button>
          <button className="grow link" onClick={() => onOpen(p.id)} style={{ textAlign: "start" }}>
            <b>{p.username}</b> <span className="lvl-pill">{fmtNum(p.level)}</span>
            <div className="small muted">{p.reason === "near" && p.distanceM ? t("~{d} away", { d: formatDistance(p.distanceM) }) : t("{n} followers", { n: p.followers ?? 0 })}</div>
          </button>
          <FollowButton small id={p.id} following={!!followed[p.id]} onChange={(on) => setFollowed((f) => ({ ...f, [p.id]: on }))} />
        </div>
      ))}
    </>
  );
}

function ProfileView({ id, onOpen }: { id: string; onOpen: (id: string) => void }) {
  const { me, act, openChat, startCall } = useGame();
  const [data, setData] = useState<{ profile: Profile; posts: PostView[]; next: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [list, setList] = useState<{ side: "followers" | "following"; people: Person[] } | null>(null);
  const [bio, setBio] = useState<string | null>(null);
  const load = useCallback(() => api<NonNullable<typeof data>>(`/api/social?view=profile&id=${id}`).then(setData).catch((e) => setError((e as Error).message)), [id]);
  useEffect(() => {
    load();
  }, [load]);
  if (error) return <p className="small" style={{ color: "var(--red)" }}>{error}</p>;
  if (!data) return <div className="feed-skeleton" aria-hidden><i /><i /></div>;
  const p = data.profile;
  const showList = (side: "followers" | "following") => api<{ people: Person[] }>(`/api/social?view=follows&id=${id}&side=${side}`).then((r) => setList({ side, people: r.people }));
  const dm = `dm:${[me.id, p.id].sort().join(":")}`;
  return (
    <>
      <div className="profile-hero">
        <div className="profile-avatar">{p.avatar}<span className="lvl">{fmtNum(p.level)}</span></div>
        <h3>{p.username}</h3>
        {p.followsYou && <span className="tag">{t("Follows you")}</span>}
        {bio != null ? (
          <div className="row" style={{ width: "100%" }}>
            <input className="input grow" maxLength={160} value={bio} onChange={(e) => setBio(e.target.value)} placeholder={t("A line about you")} />
            <Button className="btn small" onClick={() => act(() => api("/api/social", { body: { action: "bio", bio } })).then((ok) => void (ok && (setBio(null), load())))}>{t("Save")}</Button>
          </div>
        ) : (
          <p className="small profile-bio" dir="auto" onClick={() => p.me && setBio(p.bio)}>{p.bio || (p.me ? t("Tap to add a bio") : "")}</p>
        )}
        <div className="profile-counts">
          <button onClick={() => showList("followers")}><b>{fmtNum(p.followers)}</b><span>{t("Followers")}</span></button>
          <button onClick={() => showList("following")}><b>{fmtNum(p.following)}</b><span>{t("Following")}</span></button>
          <div><b>{fmtNum(p.posts)}</b><span>{t("Posts")}</span></div>
        </div>
        <div className="profile-stats small">
          <span>🚶 {formatDistance(p.stats.walkedM)}</span>
          <span>👟 {fmtNum(p.stats.steps)}</span>
          <span>📦 {t("{n} deliveries", { n: p.stats.deliveries })}</span>
          <span>🏪 {t("{n} store visits", { n: p.stats.visits })}</span>
        </div>
        {!p.me && (
          <div className="row wrap" style={{ justifyContent: "center" }}>
            <FollowButton id={p.id} following={p.isFollowing} onChange={() => load()} />
            {p.isFollowing && p.followsYou && <Button className="btn" onClick={() => openChat(dm, p.username)}>💬 {t("Message")}</Button>}
            {p.isFollowing && p.followsYou && <Button className="btn ghost" onClick={() => startCall({ id: p.id, username: p.username, avatar: p.avatar }, false)}>📞</Button>}
          </div>
        )}
      </div>
      {list && (
        <div className="card">
          <div className="row"><b className="grow">{list.side === "followers" ? t("Followers") : t("Following")}</b><button className="close" onClick={() => setList(null)}>✕</button></div>
          {list.people.length === 0 && <p className="small muted">{t("No one yet")}</p>}
          {list.people.map((x) => (
            <button key={x.id} className="drive-job" onClick={() => (setList(null), onOpen(x.id))}>
              <span className="ic">{x.avatar}</span><span className="grow">{x.username}</span><span className="lvl-pill">{fmtNum(x.level)}</span>
            </button>
          ))}
        </div>
      )}
      {data.posts.length === 0 && <p className="small muted" style={{ textAlign: "center" }}>{p.me ? t("You haven't posted yet.") : t("No posts yet.")}</p>}
      {data.posts.map((x) => <PostCard key={x.id} p={x} onOpen={onOpen} onGone={load} />)}
    </>
  );
}
