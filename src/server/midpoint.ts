// Vasatyab: the meeting point in the middle of a party, from where its members last were
// (the 3D city's position while they drive, otherwise their last GPS report), with a few real
// places around it to meet at. The maths is lib/midpoint.ts; "set as gather point" stores the
// point on the party (DriveParty.meetLat/Lng) so every member's poll sees it.
import { prisma } from "../lib/db";
import { distanceM, type LatLng } from "../lib/geo";
import { t } from "../lib/i18n";
import { midpoint, rankPlaces, unevenM, type MidMethod } from "../lib/midpoint";
import { gridSpot } from "../lib/party";
import { PLACE_CATS, type PlaceCat } from "../lib/places";
import { VENDOR_KINDS } from "../lib/localData";
import { notify } from "./hub";
import { HttpError } from "./http";
import { myParty, isVirtual } from "./drive";
import { placesNear } from "./city";
import { vendorsAround } from "./localData";
import type { User } from "@prisma/client";

/** A position older than this is shown as stale; older than the second, not used at all. */
const STALE_MS = 10 * 60_000;
const DROP_MS = 6 * 3600_000;
/** Places to meet at: where you sit down together. */
const MEET_CATS: PlaceCat[] = ["cafe", "restaurant", "bakery", "icecream", "bar", "burger", "pizza", "park"];
/** A place this many people said Siktir about is not suggested. */
const HIDE_AT = 3;

export type MidPlace = { id: string; name: string; emoji: string; lat: number; lng: number; maxM: number; fromM: number; siktir: number; source: "place" | "vendor" };
export type MidMember = { userId: string; name: string; avatar: string; me: boolean; lat: number | null; lng: number | null; distM: number | null; ageS: number | null; stale: boolean };
export type MidView = {
  partyId: string;
  method: MidMethod;
  point: LatLng | null;
  members: MidMember[];
  maxM: number;
  totalM: number;
  unevenM: number;
  places: MidPlace[];
  meet: (LatLng & { name: string }) | null;
};

const withTimeout = <T>(p: Promise<T>, ms: number, none: T): Promise<T> => Promise.race([p.catch(() => none), new Promise<T>((r) => setTimeout(() => r(none), ms))]);

/** `places: false` skips the suggestions (the 2D map polls without them just to know a party is there). null: not in a party. */
export async function partyMidpoint(userId: string, method: MidMethod, places = true): Promise<MidView | null> {
  const party = await myParty(userId);
  if (!party) return null;
  const ids = party.members.map((m) => m.userId);
  const [states, users] = await Promise.all([
    prisma.driveState.findMany({ where: { userId: { in: ids } }, select: { userId: true, lat: true, lng: true, updatedAt: true } }),
    prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, lastLat: true, lastLng: true, locAt: true, lastSeenAt: true } }),
  ]);
  const now = Date.now();
  const members: MidMember[] = party.members.map((m) => {
    const s = states.find((x) => x.userId === m.userId);
    const u = users.find((x) => x.id === m.userId);
    // The freshest of the 3D position and the last GPS report.
    const cands: { lat: number; lng: number; at: number }[] = [];
    if (s) cands.push({ lat: s.lat, lng: s.lng, at: s.updatedAt.getTime() });
    if (u?.lastLat != null && u.lastLng != null) cands.push({ lat: u.lastLat, lng: u.lastLng, at: (u.locAt ?? u.lastSeenAt)?.getTime() ?? 0 });
    const best = cands.sort((a, b) => b.at - a.at)[0];
    const age = best ? now - best.at : null;
    const usable = !!best && age != null && age < DROP_MS;
    return { userId: m.userId, name: m.name, avatar: m.avatar, me: m.userId === userId, lat: usable ? best.lat : null, lng: usable ? best.lng : null, distM: null, ageS: usable ? Math.round(age! / 1000) : null, stale: usable ? age! > STALE_MS : false };
  });
  const located = members.filter((m) => m.lat != null);
  const pts = located.map((m) => ({ lat: m.lat!, lng: m.lng! }));
  const res = midpoint(pts, method);
  located.forEach((m, i) => (m.distM = res?.distances[i] ?? null));
  const meet = party.meetLat != null && party.meetLng != null ? { lat: party.meetLat, lng: party.meetLng, name: party.meetName ?? "" } : null;
  const base = { partyId: party.id, method, members, meet };
  if (!res) return { ...base, point: null, maxM: 0, totalM: 0, unevenM: 0, places: [] };
  return { ...base, point: res.point, maxM: res.maxM, totalM: res.totalM, unevenM: unevenM(res), places: places ? await suggestPlaces(res.point, pts, res.maxM) : [] };
}

async function suggestPlaces(point: LatLng, pts: LatLng[], spreadM: number): Promise<MidPlace[]> {
  const radius = Math.min(2500, Math.max(500, spreadM * 0.5));
  const [spots, vendors] = await Promise.all([withTimeout(placesNear(point, radius, 80), 3000, []), withTimeout(vendorsAround(point, radius), 2500, [])]);
  const cands = [
    ...spots.filter((p) => MEET_CATS.includes(p.cat) && p.name).map((p) => ({ id: p.id, name: p.name, emoji: PLACE_CATS[p.cat].emoji, lat: p.lat, lng: p.lng, source: "place" as const })),
    ...vendors.filter((v) => v.kind !== "market" && distanceM(point, v) <= radius).map((v) => ({ id: v.code, name: v.title, emoji: VENDOR_KINDS[v.kind].emoji, lat: v.lat, lng: v.lng, source: "vendor" as const })),
  ];
  if (!cands.length) return [];
  const marks = await prisma.placeDislike.groupBy({ by: ["placeKey"], where: { placeKey: { in: cands.map((c) => c.id) }, hidden: false }, _count: true }).catch(() => []);
  const bad = new Map(marks.map((m) => [m.placeKey, m._count]));
  const ranked = rankPlaces(cands.filter((c) => (bad.get(c.id) ?? 0) < HIDE_AT), pts.length ? pts : [point], 6);
  return ranked.map(({ maxM, ...c }) => ({ ...c, maxM: Math.round(maxM), fromM: Math.round(distanceM(point, c)), siktir: bad.get(c.id) ?? 0 }));
}

/** Pin the party's meeting point (any member; everyone is told). */
export async function setMeet(u: User, p: LatLng, name: string) {
  const party = await myParty(u.id);
  if (!party) throw new HttpError(400, t("You're not in a party"));
  const label = name.trim().slice(0, 80);
  await prisma.driveParty.update({ where: { id: party.id }, data: { meetLat: p.lat, meetLng: p.lng, meetName: label || null } });
  for (const m of party.members) if (m.userId !== u.id) await notify(m.userId, () => ({ kind: "social", link: "play", title: t("📍 {name} set the party's meeting point{place}", { name: u.username, place: label ? ` — ${label}` : "" }) }));
}

export async function clearMeet(userId: string) {
  const party = await myParty(userId);
  if (!party) throw new HttpError(400, t("You're not in a party"));
  await prisma.driveParty.update({ where: { id: party.id }, data: { meetLat: null, meetLng: null, meetName: null } });
}

/** Go to the meeting point: my car moves there (in a row with the others), like going to the host. */
export async function gatherAtMeet(u: User, sim?: boolean) {
  if (!isVirtual(u, sim)) throw new HttpError(403, t("Party games are for Play from home — switch it on to join your friends"));
  const party = await myParty(u.id);
  if (!party) throw new HttpError(400, t("You're not in a party"));
  if (party.meetLat == null || party.meetLng == null) throw new HttpError(409, t("The party hasn't set a meeting point yet"));
  const me = await prisma.driveState.findUnique({ where: { userId: u.id } });
  if (!me) throw new HttpError(400, t("Open the 3D city first"));
  const idx = Math.max(0, party.members.findIndex((m) => m.userId === u.id));
  const spot = gridSpot({ lat: party.meetLat, lng: party.meetLng, yaw: 0 }, idx);
  await prisma.driveState.update({ where: { userId: u.id }, data: { lat: spot.lat, lng: spot.lng, alt: 0, yaw: spot.yaw, speed: 0 } });
  await prisma.user.update({ where: { id: u.id }, data: { lastLat: spot.lat, lastLng: spot.lng, locAt: new Date() } });
  return spot;
}
