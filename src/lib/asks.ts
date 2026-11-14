// Requests waiting on a player's answer — a friend request, an invite to a party in the 3D city
// (pure; tests/asks.test.ts). The server tags their notifications (`friendreq:<friendshipId>`,
// `partyinv:<code>`) so the game can answer them in place, in one card, wherever the player is
// (the map or the 3D city): Accept / Decline, Join / Not now — never "go to panel X and type the code".

export type Ask =
  | { kind: "friend"; key: string; friendshipId: string; name: string; avatar: string }
  | { kind: "party"; key: string; code: string; name: string; avatar: string; players?: number };

export const friendTag = (friendshipId: string) => `friendreq:${friendshipId}` as const;
export const partyTag = (code: string) => `partyinv:${code}` as const;

/** A tagged notification → the request it is (null for any other notification). */
export function askOfTag(tag: string | null | undefined, name = "", avatar = ""): Ask | null {
  const m = /^(friendreq|partyinv):([A-Za-z0-9_-]{1,40})$/.exec(tag ?? "");
  if (!m) return null;
  return m[1] === "friendreq" ? { kind: "friend", key: tag!, friendshipId: m[2], name, avatar } : { kind: "party", key: tag!, code: m[2].toUpperCase(), name, avatar };
}

/** What's waiting when the game opens: the friend requests and party invites the server still has. */
export function asksFrom(
  incoming: { friendshipId: string; username: string; avatar: string }[] | null | undefined,
  invites: { code: string; host: string; players: number }[] | null | undefined,
): Ask[] {
  return [
    ...(incoming ?? []).map((f) => ({ kind: "friend" as const, key: friendTag(f.friendshipId), friendshipId: f.friendshipId, name: f.username, avatar: f.avatar })),
    ...(invites ?? []).map((i) => ({ kind: "party" as const, key: partyTag(i.code), code: i.code, name: i.host, avatar: "🎉", players: i.players })),
  ];
}

/** At most this many cards wait at once (the oldest beyond it drop; they're still in Friends / Play together). */
export const MAX_ASKS = 3;

/** New requests join the queue once each (by key), newest last; ones already answered (`done`) never come back this session. */
export function mergeAsks(have: Ask[], more: Ask[], done: ReadonlySet<string>): Ask[] {
  const out = [...have];
  for (const a of more) {
    if (done.has(a.key)) continue;
    const i = out.findIndex((x) => x.key === a.key);
    // A name that arrived later (the open requests list) fills in one the notification lacked.
    if (i >= 0) out[i] = { ...out[i], name: out[i].name || a.name, avatar: out[i].avatar || a.avatar } as Ask;
    else out.push(a);
  }
  return out.slice(-MAX_ASKS);
}

/**
 * The cards after asking the server what is still open (`open`: its friend requests and
 * invites, the truth): ones answered elsewhere — in the Crew panel, on another device, a party
 * that ended — leave, new ones join.
 */
export function syncAsks(have: Ask[], open: Ask[], done: ReadonlySet<string>): Ask[] {
  const still = new Set(open.map((a) => a.key));
  return mergeAsks(have.filter((a) => still.has(a.key)), open, done);
}

/** Fired on window when a request was answered anywhere (the Crew panel, a card): everything showing them reloads. */
export const ASKS_CHANGED = "sq:asks-changed";
