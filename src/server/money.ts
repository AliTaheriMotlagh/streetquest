// The toman wallet: money pickups on the map, toman for store missions, and cash-outs.
// Every payment goes through payToman, which records it as a Claim (one per player per
// thing, so nothing pays twice) in the same transaction as the wallet credit.
import type { User } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { bbox, cellKey, cellOf, distanceM, type LatLng } from "../lib/geo";
import { DROP_PREFIX, isDropId, moneyAround, resolveMoney, tierAmount, tiersOwned, tomanFor, type MoneyPickup } from "../lib/money";
import { S } from "../lib/settings";
import { msg, t } from "../lib/i18n";
import { HttpError } from "./http";
import { lastKnownLocation, track } from "./rewards";
import { questEvent } from "./quests";
import { INTERACT_RADIUS_M } from "../lib/reach";
import { testModeOpen } from "./session";

const DAY_MS = 86_400_000;

/** Toman paid to this player in the last 24 hours. */
export async function earnedToday(userId: string) {
  const r = await prisma.claim.aggregate({ where: { userId, toman: { gt: 0 }, createdAt: { gt: new Date(Date.now() - DAY_MS) } }, _sum: { toman: true } });
  return r._sum.toman ?? 0;
}

/**
 * Test-mode positions are teleports: they can pick things up (to try the game) but never
 * earn real money. With test mode open to everyone, nobody's GPS position can be trusted.
 */
export const earnsToman = (u: Pick<User, "locSim" | "remotePlay">) => u.remotePlay || (!u.locSim && !testModeOpen());
export const TEST_MODE_NOTE = msg("🕹️ Test mode — no toman");

/**
 * Pay `amount` toman for `spawnId` (once per player). `inTx` runs inside the same
 * transaction, e.g. to take one claim off an admin drop's budget.
 */
export async function payToman(userId: string, spawnId: string, kind: string, cell: string, amount: number, inTx?: (tx: Prisma.TransactionClient) => Promise<void>) {
  if (S.moneyDailyCap > 0 && (await earnedToday(userId)) + amount > S.moneyDailyCap)
    throw new HttpError(429, t("You've reached today's limit of {n} toman — come back tomorrow", { n: S.moneyDailyCap }));
  try {
    await prisma.$transaction(async (tx) => {
      await tx.claim.create({ data: { userId, spawnId, kind, cell, toman: amount } });
      await inTx?.(tx);
      if (amount > 0) await tx.user.update({ where: { id: userId }, data: { toman: { increment: amount } } });
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new HttpError(409, t("Already collected"));
    throw e;
  }
}

/** The money a player sees: admin drops first, then the game's own (the levels they own), unclaimed and nearest first. */
export async function moneyFor(u: Pick<User, "id" | "remotePlay" | "moneyTier">, here: LatLng, radiusM = 1500): Promise<{ priority: MoneyPickup[]; rest: MoneyPickup[] }> {
  const now = new Date();
  const box = bbox(here, radiusM);
  const drops = await prisma.moneyDrop.findMany({
    where: { lat: { gte: box.minLat, lte: box.maxLat }, lng: { gte: box.minLng, lte: box.maxLng }, activeFrom: { lte: now }, activeTo: { gte: now } },
    take: 200,
  });
  const owned = tiersOwned(u.moneyTier);
  const game = moneyAround(here).filter((g) => g.tier <= owned);
  const ids = [...drops.map((d) => DROP_PREFIX + d.id), ...game.map((g) => g.id)];
  const taken = new Set((await prisma.claim.findMany({ where: { userId: u.id, spawnId: { in: ids } }, select: { spawnId: true } })).map((c) => c.spawnId));
  const home = u.remotePlay;
  const byDist = (a: MoneyPickup, b: MoneyPickup) => distanceM(here, a) - distanceM(here, b);
  const priority = drops
    .filter((d) => !taken.has(DROP_PREFIX + d.id) && (d.maxClaims == null || d.claims < d.maxClaims))
    .map((d) => ({ id: DROP_PREFIX + d.id, lat: d.lat, lng: d.lng, amount: tomanFor(d.amount, home), tier: 0, expiresAt: d.activeTo.getTime(), drop: { label: d.label, sponsor: d.sponsor }, claimed: false }))
    .sort(byDist);
  const rest = game
    .filter((g) => !taken.has(g.id) && distanceM(here, g) <= radiusM)
    .map((g) => ({ id: g.id, lat: g.lat, lng: g.lng, amount: tomanFor(tierAmount(g.tier), home), tier: g.tier, expiresAt: g.expiresAt, drop: null, claimed: false }))
    .sort(byDist);
  return { priority, rest };
}

/** Pick up money at the server-trusted position. */
export async function collectMoney(u: User, id: string) {
  const earns = earnsToman(u);
  const here = await lastKnownLocation(u.id);
  const reach = INTERACT_RADIUS_M + S.claimSlack;
  const home = u.remotePlay;

  if (isDropId(id)) {
    const dropId = id.slice(DROP_PREFIX.length);
    const d = await prisma.moneyDrop.findUnique({ where: { id: dropId } });
    const now = new Date();
    if (!d || d.activeFrom > now || d.activeTo < now) throw new HttpError(410, t("This money is gone"));
    if (distanceM(here, d) > reach) throw new HttpError(400, t("Get within {m} m to pick it up", { m: INTERACT_RADIUS_M }));
    const amount = earns ? tomanFor(d.amount, home) : 0;
    const { cx, cy } = cellOf(d);
    await payToman(u.id, id, "money", cellKey(cx, cy), amount, async (tx) => {
      // The drop's budget: the last claim wins the race, everyone after gets "gone".
      // Test-mode pickups pay nothing, so they don't use it up.
      const n = amount
        ? await tx.$executeRaw`UPDATE "MoneyDrop" SET "claims" = "claims" + 1, "paid" = "paid" + ${amount} WHERE "id" = ${dropId} AND ("maxClaims" IS NULL OR "claims" < "maxClaims")`
        : d.maxClaims == null || d.claims < d.maxClaims;
      if (!n) throw new HttpError(410, t("Someone got there first — all of this drop is picked up"));
    });
    await afterMoney(u.id, d.sponsor ?? d.label);
    return { message: amount ? t("💵 +{n} toman", { n: amount }) : t(TEST_MODE_NOTE), toman: amount };
  }

  const m = resolveMoney(id);
  if (!m) throw new HttpError(410, t("This money is gone"));
  if (m.tier > tiersOwned(u.moneyTier)) throw new HttpError(403, t("Unlock {n} toman money in your wallet first", { n: tomanFor(tierAmount(m.tier), home) }));
  if (distanceM(here, m) > reach) throw new HttpError(400, t("Get within {m} m to pick it up", { m: INTERACT_RADIUS_M }));
  const amount = earns ? tomanFor(tierAmount(m.tier), home) : 0;
  await payToman(u.id, id, "money", m.cell, amount);
  await afterMoney(u.id);
  return { message: amount ? t("💵 +{n} toman", { n: amount }) : t(TEST_MODE_NOTE), toman: amount };
}

async function afterMoney(userId: string, campaign?: string) {
  await questEvent(userId, "money");
  await track("money", { userId, campaign });
}

// ---------------------------------------------------------------- money levels
/** Buy the next money level from the wallet: its bigger pickups show on the map from now on. */
export async function buyMoneyTier(u: User) {
  const owned = tiersOwned(u.moneyTier);
  const next = S.moneyTiers[owned];
  if (!next) throw new HttpError(400, t("You've unlocked every money level"));
  // Only from the level they're on and only with the toman there (two taps can't buy twice).
  const done = await prisma.user.updateMany({ where: { id: u.id, moneyTier: u.moneyTier, toman: { gte: next.price } }, data: { toman: { decrement: next.price }, moneyTier: owned + 1 } });
  if (!done.count) throw new HttpError(400, t("You need {n} toman in your wallet to unlock this", { n: next.price }));
  await track("money_tier", { userId: u.id, campaign: String(owned + 1) });
  return { message: t("🔓 {n} toman money now shows on your map", { n: tomanFor(next.amount, u.remotePlay) }), moneyTier: owned + 1 };
}

// ---------------------------------------------------------------- cash-out
const CARD = /^\d{16}$/;
const SHEBA = /^IR\d{24}$/;
/** Persian digits, spaces and dashes out; "ir" upper-cased. */
export const cleanAccount = (s: string) => s.replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[\s-]/g, "").toUpperCase();
export const validAccount = (s: string) => CARD.test(s) || SHEBA.test(s);

export async function requestCashout(u: User, d: { amount: number; fullName: string; phone: string; account: string }) {
  if (!S.cashoutEnabled) throw new HttpError(400, t("Cash-out is paused right now — try again later"));
  const account = cleanAccount(d.account);
  if (!validAccount(account)) throw new HttpError(400, t("Enter a 16-digit card number or a Sheba number (IR + 24 digits)"));
  const amount = Math.floor(d.amount);
  if (amount < S.cashoutMin) throw new HttpError(400, t("The minimum cash-out is {n} toman", { n: S.cashoutMin }));
  if (await prisma.cashout.count({ where: { userId: u.id, status: "PENDING" } })) throw new HttpError(409, t("You already have a cash-out waiting — we'll pay that one first"));
  // Take it from the wallet only if it's there (two taps can't spend it twice).
  const taken = await prisma.user.updateMany({ where: { id: u.id, toman: { gte: amount } }, data: { toman: { decrement: amount } } });
  if (!taken.count) throw new HttpError(400, t("Not enough toman in your wallet"));
  const c = await prisma.cashout.create({ data: { userId: u.id, amount, fullName: d.fullName.trim(), phone: d.phone.trim(), account } });
  await track("cashout_request", { userId: u.id });
  return { message: t("✅ Cash-out of {n} toman requested — we'll pay it to your account soon", { n: amount }), id: c.id };
}

export async function myCashouts(userId: string) {
  const list = await prisma.cashout.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 20 });
  return list.map((c) => ({ id: c.id, amount: c.amount, status: c.status, note: c.note, account: maskAccount(c.account), createdAt: c.createdAt.getTime(), decidedAt: c.decidedAt?.getTime() ?? null }));
}

export const maskAccount = (a: string) => (a.length > 8 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a);

/** Admin: paid (with a bank reference) or rejected (the toman goes back to the wallet). */
export async function decideCashout(id: string, adminId: string, paid: boolean, note?: string) {
  const c = await prisma.cashout.findUnique({ where: { id } });
  if (!c || c.status !== "PENDING") throw new HttpError(400, t("This request was already handled"));
  await prisma.$transaction(async (tx) => {
    const moved = await tx.cashout.updateMany({ where: { id, status: "PENDING" }, data: { status: paid ? "PAID" : "REJECTED", note: note || null, decidedAt: new Date(), decidedBy: adminId } });
    if (!moved.count) throw new HttpError(409, t("This request was already handled"));
    if (!paid) await tx.user.update({ where: { id: c.userId }, data: { toman: { increment: c.amount } } });
  });
  return c;
}
