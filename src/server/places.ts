// Missions at real places: what's on offer around the player, and starting or
// finishing one. A delivery starts on the spot at the real pickup place and becomes a
// timed run to the real drop-off (see /api/runs); a visit pays on check-in.
import { prisma } from "../lib/db";
import { cellKey, distanceM, type LatLng } from "../lib/geo";
import { tileOf } from "../lib/city";
import { CUSTOMER_DOOR, parsePlaceMissionId, placeBucket, placeMissions, placeToman, PLACE_CATS, type Place, type PlaceCat, type PlaceMission } from "../lib/places";
import { INTERACT_RADIUS_M } from "../lib/reach";
import { S } from "../lib/settings";
import { msg, t } from "../lib/i18n";
import { placesAround, placesIn } from "./city";
import { HttpError } from "./http";
import { checkClaimAchievements, grant, itemLabel, track } from "./rewards";
import { questEvent } from "./quests";
import { autoPost } from "./social";
import { earnsToman, payToman, TEST_MODE_NOTE } from "./money";

/** The cell keys around one cell (its own first). */
function ring(cell: string) {
  const [cx, cy] = cell.split("_").map(Number);
  const keys = [cell];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (dx || dy) keys.push(cellKey(cx + dx, cy + dy));
  return keys;
}

/** Every place mission in the 3×3 cells around `here` for the current window. */
export async function missionsAround(here: LatLng, bucket = placeBucket()) {
  const byCell = await placesAround(here, { warm: true });
  // Drop-offs come from each cell's own 3×3 ring — the same pool resolvePlaceMission
  // uses — so the ring around the edge cells is read too.
  const { cx, cy } = tileOf(here);
  const outer: string[] = [];
  for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) if (Math.abs(dx) === 2 || Math.abs(dy) === 2) outer.push(cellKey(cx + dx, cy + dy));
  const all = new Map([...byCell, ...(await placesIn(outer))]);
  const out: PlaceMission[] = [];
  for (const [cell, places] of byCell) out.push(...placeMissions(cell, places, ring(cell).flatMap((k) => all.get(k) ?? []), bucket));
  return { byCell, missions: out };
}

/** Rebuild one mission from its id (any window — finishing a run can cross into the next one). */
export async function resolvePlaceMission(id: string): Promise<PlaceMission | null> {
  const p = parsePlaceMissionId(id);
  if (!p) return null;
  const byCell = await placesIn(ring(p.cell));
  const places = byCell.get(p.cell);
  if (!places) return null;
  const pool = [...byCell.values()].flat();
  return placeMissions(p.cell, places.filter((x) => x.id === p.placeId), pool, p.bucket)[0] ?? null;
}

/** The nearest named real place within `maxM` (for check-in posts). */
export async function nearestPlace(here: LatLng, maxM = 80): Promise<Place | null> {
  const byCell = await placesIn([cellKey(tileOf(here).cx, tileOf(here).cy)]);
  let best: Place | null = null, bestD = maxM;
  for (const p of [...byCell.values()].flat()) {
    const d = distanceM(here, p);
    if (d <= bestD) (best = p), (bestD = d);
  }
  const biz = await prisma.business.findMany({ where: { lat: { gte: here.lat - 0.002, lte: here.lat + 0.002 }, lng: { gte: here.lng - 0.003, lte: here.lng + 0.003 } }, take: 20 });
  for (const b of biz) {
    const d = distanceM(here, b);
    if (d <= bestD) (best = { id: `b:${b.id}`, name: b.name, cat: b.category as PlaceCat, lat: b.lat, lng: b.lng }), (bestD = d);
  }
  return best;
}

const reach = () => INTERACT_RADIUS_M + S.claimSlack;

async function recordClaim(userId: string, id: string) {
  const cell = parsePlaceMissionId(id)?.cell ?? "";
  try {
    await prisma.claim.create({ data: { userId, spawnId: id, kind: "place", cell } });
  } catch {
    throw new HttpError(409, t("You already did this one — new jobs here every 30 minutes"));
  }
}

/** Start a delivery (at the pickup) or check in at a place (visit). */
export async function startPlaceMission(u: { id: string; remotePlay: boolean; locSim: boolean }, id: string, here: LatLng) {
  const userId = u.id;
  const m = await resolvePlaceMission(id);
  if (!m || m.expiresAt < Date.now()) throw new HttpError(410, t("This job is gone — check the map for new ones"));
  const vars = { place: m.place.name, dest: m.dest?.name ?? t(CUSTOMER_DOOR) };
  if (distanceM(here, m.place) > reach()) throw new HttpError(400, t("Go to {place} first", vars));

  if (m.kind === "deliver") {
    const active = await prisma.missionRun.findFirst({ where: { userId, status: "ACTIVE" } });
    if (active) throw new HttpError(400, t("Finish or abandon your current run first"));
    await recordClaim(userId, id);
    const run = await prisma.missionRun.create({
      data: { userId, spawnId: id, title: m.title, targetLat: m.dest!.lat, targetLng: m.dest!.lng, deadline: new Date(Date.now() + m.timeLimitS * 1000), rewardXp: m.rewardXp, rewardCoins: m.rewardCoins },
    });
    await track("place_mission", { userId, campaign: m.place.cat });
    return { message: t("{emoji} Picked up at {place} — deliver to {dest}!", { emoji: m.emoji, ...vars }), run };
  }

  const toman = earnsToman(u) ? placeToman("visit", u.remotePlay) : 0;
  await payToman(userId, id, "place", parsePlaceMissionId(id)?.cell ?? "", toman).catch((e) => {
    throw e instanceof HttpError && e.status === 409 ? new HttpError(409, t("You already did this one — new jobs here every 30 minutes")) : e;
  });
  const items = m.item ? { [m.item]: 1 } : undefined;
  await grant(userId, { xp: m.rewardXp, items });
  await questEvent(userId, "place");
  await checkClaimAchievements(userId, "day");
  await track("place_mission", { userId, campaign: m.place.cat });
  await autoPost(userId, "mission", { t: msg("{emoji} Checked in at {place}"), v: { emoji: PLACE_CATS[m.place.cat].emoji, place: m.place.name } }, { name: m.place.name, cat: m.place.cat, lat: m.place.lat, lng: m.place.lng });
  return { message: [t("{emoji} {title} at {place}", { emoji: m.emoji, title: t(m.title), place: m.place.name }), m.item ? itemLabel(m.item) : "", toman ? t("💵 +{n} toman", { n: toman }) : t(TEST_MODE_NOTE)].filter(Boolean).join(" · "), toman };
}

/** A finished delivery run from a real place: the toman, the item and the feed post. */
export async function finishPlaceRun(u: { id: string; remotePlay: boolean; locSim: boolean }, run: { id: string; spawnId: string }) {
  const userId = u.id;
  const m = await resolvePlaceMission(run.spawnId);
  if (!m) return null;
  let toman = 0;
  if (earnsToman(u)) {
    toman = placeToman("deliver", u.remotePlay);
    await payToman(userId, `done:${run.id}`, "place", parsePlaceMissionId(run.spawnId)?.cell ?? "", toman).catch(() => (toman = 0));
  }
  await questEvent(userId, "place");
  if (m.item) await grant(userId, { items: { [m.item]: 1 } }, { raw: true });
  await autoPost(userId, "mission", { t: msg("{emoji} Delivered from {place} to {dest}"), v: { emoji: m.emoji, place: m.place.name, dest: m.dest?.name ?? "" } }, { name: m.place.name, cat: m.place.cat, lat: m.place.lat, lng: m.place.lng });
  return [toman ? t("💵 +{n} toman", { n: toman }) : "", m.item ? itemLabel(m.item) : ""].filter(Boolean).join(" · ");
}
