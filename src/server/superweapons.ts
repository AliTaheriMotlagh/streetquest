// Superweapon launches: public countdown, SAM interception, then an impact that hits
// every hostile tower, squad, base, outpost garrison and commander in the blast.
// Resolved lazily (whoever looks at the map after impact), like squads and waves.
import type { User } from "@prisma/client";
import { prisma } from "../lib/db";
import { bbox, distanceM, type LatLng } from "../lib/geo";
import { outpostsAround } from "../lib/outposts";
import { effectiveLevel, factionOf, levelOf, UNIT_BY_KEY, type Army, type UnitKey } from "../lib/rts";
import { chargeMs, falloff, INTERCEPT_MAX, INTERCEPT_PER_SAM, INTERCEPT_RANGE_M, levelPower, SUPER_BY_FACTION, SUPER_RANGE_M, SUPERWEAPONS, type SuperKey } from "../lib/superweapons";
import { squadPos, towerStats } from "../lib/td";
import { loadBase } from "./army";
import { HttpError } from "./http";
import { notify, onlineSince } from "./hub";
import { questEvent } from "./quests";
import { grant, unlock } from "./rewards";
import { friendIds } from "./rooms";
import { knockDown, maxHpOf, shotProtection } from "./td";
import { clean, squadForce } from "./warfare";

const box = (p: LatLng, r: number) => {
  const b = bbox(p, r);
  return { lat: { gte: b.minLat, lte: b.maxLat }, lng: { gte: b.minLng, lte: b.maxLng } };
};

/** Is this player's superweapon built and charged? */
export async function superStatus(u: Pick<User, "id" | "faction">) {
  const f = factionOf(u.faction);
  const def = f ? SUPER_BY_FACTION[f.key] : null;
  const base = await loadBase({ ownerId: u.id });
  const b = base?.buildings.find((x) => x.type === "superweapon");
  const level = b ? effectiveLevel(b) : 0;
  const last = await prisma.superstrike.findFirst({ where: { ownerId: u.id }, orderBy: { launchAt: "desc" } });
  const readyAt = def && level > 0 ? Math.max(b!.readyAt.getTime(), last ? last.launchAt.getTime() + chargeMs(def, level) : 0) : null;
  return { def, level, readyAt, base, last };
}

export async function launch(u: User, target: LatLng) {
  const { def, level, readyAt, base } = await superStatus(u);
  if (!def || !base) throw new HttpError(400, "Plant a base and pick a faction first");
  if (level < 1) throw new HttpError(400, `Build a ${def.name} at your base first (Command Center level 4)`);
  if (readyAt! > Date.now()) throw new HttpError(400, `${def.name} is still charging`);
  if (distanceM(base, target) > SUPER_RANGE_M) throw new HttpError(400, `Out of range — ${SUPER_RANGE_M / 1000} km from your base`);
  const now = Date.now();
  // Claim the charge atomically: the latest launch must still be the one we saw.
  const s = await prisma.$transaction(async (tx) => {
    const last = await tx.superstrike.findFirst({ where: { ownerId: u.id }, orderBy: { launchAt: "desc" } });
    if (last && last.launchAt.getTime() + chargeMs(def, level) > now) throw new HttpError(409, "Already fired");
    return tx.superstrike.create({
      data: { ownerId: u.id, kind: def.key, level, lat: target.lat, lng: target.lng, radius: def.radius, impactAt: new Date(now + def.warnS * 1000) },
    });
  });
  await questEvent(u.id, "power");
  await unlock(u.id, "superweapon");
  // Everyone near ground zero gets the warning — that's the point: run!
  const near = await prisma.user.findMany({
    where: { id: { not: u.id }, lastSeenAt: { gt: onlineSince() }, lastLat: box(target, def.radius * 4).lat, lastLng: box(target, def.radius * 4).lng },
    select: { id: true },
    take: 100,
  });
  const owners = await Promise.all([
    prisma.tower.findMany({ where: { ...box(target, def.radius), ownerId: { not: u.id } }, select: { ownerId: true }, distinct: ["ownerId"] }),
    prisma.base.findMany({ where: { ...box(target, def.radius), ownerId: { not: u.id } }, select: { ownerId: true } }),
  ]);
  const ids = new Set([...near.map((x) => x.id), ...owners.flat().map((x) => x.ownerId)]);
  for (const id of ids) await notify(id, { kind: "event", title: `${def.emoji} ${def.name.toUpperCase()} INCOMING — ${def.warnS}s!`, body: `${u.username} launched at a spot near you. Get out of the red circle!` });
  return s;
}

/** Resolve impacts near a point (or one strike by id). Idempotent. */
export async function resolveStrikes(where: { near?: LatLng; id?: string }) {
  const due = await prisma.superstrike.findMany({
    where: { resolvedAt: null, impactAt: { lte: new Date() }, ...(where.id ? { id: where.id } : {}), ...(where.near ? box(where.near, 10_000) : {}) },
    take: 5,
  });
  for (const s of due) {
    const claim = await prisma.superstrike.updateMany({ where: { id: s.id, resolvedAt: null }, data: { resolvedAt: new Date() } });
    if (claim.count) await impact(s).catch((e) => console.error("superweapon impact failed", e));
  }
}

async function impact(s: { id: string; ownerId: string; kind: string; level: number; lat: number; lng: number; radius: number }) {
  const def = SUPERWEAPONS[s.kind as SuperKey];
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: s.ownerId } });
  const allies = new Set([owner.id, ...(await friendIds(owner.id))]);
  const gz = { lat: s.lat, lng: s.lng };
  const now = Date.now();

  // SAM sites near ground zero (not the launcher's side) can shoot missiles down.
  let intercepted = 0;
  if (def.interceptable) {
    const sams = await prisma.tower.findMany({ where: { ...box(gz, INTERCEPT_RANGE_M), type: "sam", hp: { gt: 0 }, readyAt: { lte: new Date() } } });
    const n = sams.filter((t) => !allies.has(t.ownerId) && distanceM(gz, t) <= INTERCEPT_RANGE_M).length;
    intercepted = Math.min(INTERCEPT_MAX, n * INTERCEPT_PER_SAM);
  }
  const power = def.power * levelPower(s.level) * (1 - intercepted);
  const hit = (p: LatLng) => falloff(distanceM(gz, p), s.radius) * power;
  const victims = new Set<string>();
  const r = { towers: 0, towersDestroyed: 0, units: 0, bases: 0, downed: 0, outposts: 0, intercepted: Math.round(intercepted * 100) };

  // Towers
  for (const t of await prisma.tower.findMany({ where: box(gz, s.radius) })) {
    const h = hit(t);
    if (!h || allies.has(t.ownerId)) continue;
    const dmg = Math.round(towerStats(t).maxHp * 1.2 * h);
    r.towers++;
    victims.add(t.ownerId);
    if (t.hp - dmg <= 0) {
      if ((await prisma.tower.deleteMany({ where: { id: t.id } })).count) r.towersDestroyed++;
    } else await prisma.tower.update({ where: { id: t.id }, data: { hp: t.hp - dmg } });
  }

  // Squads (wherever they are right now)
  for (const q of await prisma.squad.findMany({ where: { OR: [{ toLat: box(gz, 6000).lat, toLng: box(gz, 6000).lng }] } })) {
    if (allies.has(q.ownerId)) continue;
    const at = q.status === "HOLD" ? { lat: q.toLat, lng: q.toLng } : squadPos(q, now);
    const h = hit(at);
    if (!h) continue;
    const frac = Math.min(1, h * 0.9);
    const losses: Army = {};
    for (const [k, n] of Object.entries(q.units as Army)) losses[k as UnitKey] = Math.round((n ?? 0) * frac);
    r.units += Object.values(losses).reduce((a, n) => a + (n ?? 0), 0);
    victims.add(q.ownerId);
    await squadForce(q).onLosses(losses, false);
  }

  // Bases: integrity, and a big enough hit knocks a building down a level.
  for (const b of await prisma.base.findMany({ where: box(gz, s.radius), include: { buildings: true } })) {
    const h = hit(b);
    if (!h || allies.has(b.ownerId) || (b.shieldUntil && b.shieldUntil > new Date())) continue;
    r.bases++;
    victims.add(b.ownerId);
    await prisma.base.update({ where: { id: b.id }, data: { hp: Math.max(0, b.hp - Math.round(450 * h)) } });
    if (h > 0.5) {
      const built = b.buildings.filter((x) => x.type !== "hq" && effectiveLevel(x) > 0);
      const victim = built[Math.floor(Math.random() * built.length)];
      if (victim) {
        if (victim.level <= 1) await prisma.building.delete({ where: { id: victim.id } });
        else await prisma.building.update({ where: { id: victim.id }, data: { level: victim.level - 1, readyAt: new Date() } });
      }
    }
  }

  // Outpost garrisons
  for (const site of outpostsAround(gz, 1)) {
    const h = hit(site);
    if (!h) continue;
    const row = await prisma.outpost.findUnique({ where: { id: site.id } });
    if (!row?.ownerId || allies.has(row.ownerId)) continue;
    const g = row.garrison as Army;
    const left: Army = {};
    for (const [k, n] of Object.entries(g)) left[k as UnitKey] = Math.round((n ?? 0) * (1 - Math.min(1, h)));
    await prisma.outpost.update({ where: { id: site.id }, data: { garrison: clean(left) } });
    r.outposts++;
    victims.add(row.ownerId);
  }

  // Commanders caught in the open
  const people = await prisma.user.findMany({ where: { lastSeenAt: { gt: new Date(now - 2 * 60_000) }, lastLat: box(gz, s.radius).lat, lastLng: box(gz, s.radius).lng } });
  for (const p of people) {
    if (allies.has(p.id) || p.lastLat == null || p.lastLng == null) continue;
    if (!hit({ lat: p.lastLat, lng: p.lastLng }) || shotProtection(p, now)) continue;
    await knockDown(p, await maxHpOf(p.id), owner.id);
    r.downed++;
    await notify(p.id, { kind: "event", title: `${def.emoji} You were caught in ${owner.username}'s ${def.name}`, body: "Down for 3 minutes" });
  }

  const hazardUntil = def.hazard ? new Date(now + def.hazard.minutes * 60_000) : null;
  await prisma.superstrike.update({ where: { id: s.id }, data: { result: r, hazardUntil } });
  const score = r.towersDestroyed * 3 + r.towers + r.units + r.bases * 4 + r.downed * 3 + r.outposts * 2;
  await grant(owner.id, { xp: 150 + 25 * Math.min(30, score), scrap: Math.min(30, score) });
  await prisma.battle.create({ data: { attackerId: owner.id, kind: "superweapon", targetId: s.id, targetName: def.name, won: score > 0, loot: 0, log: r } });
  for (const v of victims) await notify(v, { kind: "event", title: `${def.emoji} ${owner.username}'s ${def.name} hit your forces`, body: "Check your towers, squads and base" });
  await notify(owner.id, {
    kind: "reward",
    title: `${def.emoji} ${def.name} impact!`,
    body:
      [r.intercepted ? `${r.intercepted}% intercepted by SAMs` : "", r.towersDestroyed ? `${r.towersDestroyed} towers destroyed` : r.towers ? `${r.towers} towers damaged` : "", r.units ? `${r.units} units killed` : "", r.bases ? `${r.bases} bases hit` : "", r.downed ? `${r.downed} commanders down` : ""]
        .filter(Boolean)
        .join(" · ") || "Nothing was in the blast",
  });
}

export { levelOf };
