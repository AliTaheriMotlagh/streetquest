// Store claims (rules: lib/claims.ts): start one, read the code off the store's website, count a
// visit at the store, take a document photo, and an admin's decision. Approval marks the business
// verified; an approved dispute hands the store to the one who proved it. Everything is audited.
import { prisma } from "@/lib/db";
import { distanceM, type LatLng } from "@/lib/geo";
import { t, dot } from "@/lib/i18n";
import { S } from "@/lib/settings";
import { addVisit, claimCode, claimRisk, CLAIM_DAYS, CLAIMS_PER_WEEK, codeOnPage, sameSite, settle, type ClaimMethod, type ClaimStatus, type Visit } from "@/lib/claims";
import { HttpError } from "./http";
import { notify } from "./hub";
import { audit } from "./audit";
import { decodePhoto } from "./photos";

type Who = { id: string; username: string; role?: string };
const DAY = 86_400_000;
const PAGE_TIMEOUT_MS = 10_000;
const PAGE_MAX_BYTES = 2_000_000;

export type ClaimView = { id: string; businessId: string; method: ClaimMethod; code: string; status: ClaimStatus; dispute: boolean; visits: number; hasDoc: boolean; note: string; decision: string; createdAt: string; expired: boolean };
const view = (c: { id: string; businessId: string; method: string; code: string; status: string; dispute: boolean; evidence: unknown; docType: string; note: string; decision: string; createdAt: Date }): ClaimView => ({
  id: c.id,
  businessId: c.businessId,
  method: c.method as ClaimMethod,
  code: c.code,
  status: c.status as ClaimStatus,
  dispute: c.dispute,
  visits: ((c.evidence as { visits?: Visit[] })?.visits ?? []).length,
  hasDoc: !!c.docType,
  note: c.note,
  decision: c.decision,
  createdAt: c.createdAt.toISOString(),
  expired: c.status === "pending" && Date.now() - c.createdAt.getTime() > CLAIM_DAYS * DAY,
});
const SELECT = { id: true, businessId: true, userId: true, method: true, code: true, status: true, dispute: true, evidence: true, docType: true, note: true, decision: true, risk: true, createdAt: true } as const;

/** The latest claim per business for this player (the Business center shows where each stands). */
export async function claimsOf(userId: string, businessIds: string[]): Promise<Record<string, ClaimView>> {
  if (!businessIds.length) return {};
  const rows = await prisma.bizClaim.findMany({ where: { userId, businessId: { in: businessIds } }, select: SELECT, orderBy: { createdAt: "desc" } });
  const out: Record<string, ClaimView> = {};
  for (const r of rows) out[r.businessId] ??= view(r);
  return out;
}

async function riskFor(u: Who, dispute: boolean) {
  const [user, rejected, recent, owned] = await Promise.all([
    prisma.user.findUnique({ where: { id: u.id }, select: { createdAt: true } }),
    prisma.bizClaim.count({ where: { userId: u.id, status: "rejected" } }),
    prisma.bizClaim.count({ where: { userId: u.id, createdAt: { gt: new Date(Date.now() - 7 * DAY) } } }),
    prisma.business.count({ where: { ownerId: u.id } }),
  ]);
  return { ...claimRisk({ accountDays: user ? (Date.now() - user.createdAt.getTime()) / DAY : 0, rejected, recentClaims: recent, owned, dispute }), recent };
}

/** Start proving a store: one's own (any method) or someone else's on the game (a dispute: document only). */
export async function startClaim(u: Who, businessId: string, method: ClaimMethod, note = "") {
  const b = await prisma.business.findUnique({ where: { id: businessId }, select: { id: true, name: true, ownerId: true, verified: true, website: true } });
  if (!b) throw new HttpError(404, t("Business not found"));
  const dispute = b.ownerId !== u.id;
  if (!dispute && b.verified) throw new HttpError(400, t("{place} is already verified", { place: b.name }));
  if (dispute && method !== "document") throw new HttpError(400, t("A store someone else runs needs a licence or bill photo"));
  if (method === "website" && !b.website) throw new HttpError(400, t("Add your store's website first (Edit details)"));
  const open = await prisma.bizClaim.findFirst({ where: { userId: u.id, businessId, status: { in: ["pending", "review"] }, createdAt: { gt: new Date(Date.now() - CLAIM_DAYS * DAY) } }, select: SELECT });
  if (open?.status === "review") throw new HttpError(409, t("Your proof is with our team — we'll let you know"));
  if (open && open.method === method) return view(open);
  if (open) await prisma.bizClaim.update({ where: { id: open.id }, data: { status: "rejected", decision: "switched method" } });
  const r = await riskFor(u, dispute);
  if (r.recent >= CLAIMS_PER_WEEK && u.role !== "ADMIN") throw new HttpError(429, t("Too many claims this week — try again in a few days"));
  const c = await prisma.bizClaim.create({ data: { businessId, userId: u.id, method, code: claimCode(), dispute, risk: r.score, note: note.slice(0, 500), evidence: { flags: r.flags } }, select: SELECT });
  await audit(u, dispute ? "claim.dispute" : "claim.start", { type: "claim", id: c.id }, `${b.name}${dot()}${method}`, { businessId, risk: r.score, flags: r.flags });
  return view(c);
}

async function myClaim(u: Who, claimId: string) {
  const c = await prisma.bizClaim.findFirst({ where: { id: claimId, userId: u.id }, select: { ...SELECT, business: { select: { id: true, name: true, website: true, lat: true, lng: true, ownerId: true } } } });
  if (!c) throw new HttpError(404, t("Claim not found"));
  if (c.status !== "pending") throw new HttpError(409, c.status === "approved" ? t("Already verified") : t("This claim is closed — start a new one"));
  if (Date.now() - c.createdAt.getTime() > CLAIM_DAYS * DAY) throw new HttpError(410, t("This claim ran out — start a new one"));
  return c;
}

async function finish(u: Who, c: { id: string; method: string; risk: number; dispute: boolean; business: { id: string; name: string } }, evidence: Record<string, unknown>) {
  const status = settle(c.method as ClaimMethod, c.risk, c.dispute);
  await prisma.bizClaim.update({ where: { id: c.id }, data: { status, evidence: evidence as object, ...(status === "approved" ? { decidedAt: new Date() } : {}) } });
  if (status === "approved") await markVerified(c.business.id, c.method);
  await audit(u, status === "approved" ? "claim.approve" : "claim.review", { type: "claim", id: c.id }, `${c.business.name}${dot()}${c.method}${status === "approved" ? "${dot()}automatic" : ""}`);
  return status;
}

const markVerified = (businessId: string, how: string) => prisma.business.update({ where: { id: businessId }, data: { verified: true, verifiedAt: new Date(), verifiedHow: how } });

/** Read the store's website and look for the code. `url`: a page of the site (default its home page). */
export async function checkWebsite(u: Who, claimId: string, url?: string) {
  const c = await myClaim(u, claimId);
  if (c.method !== "website") throw new HttpError(400, t("This claim isn't by website"));
  const page = url?.trim() || c.business.website;
  if (!sameSite(page, c.business.website)) throw new HttpError(400, t("The page must be on your store's website"));
  let html = "";
  try {
    const res = await fetch(/^https?:\/\//i.test(page) ? page : `https://${page}`, { redirect: "follow", signal: AbortSignal.timeout(PAGE_TIMEOUT_MS), headers: { "user-agent": "StreetQuest/1.0 (store verification)" } });
    html = (await res.text()).slice(0, PAGE_MAX_BYTES);
  } catch {
    throw new HttpError(502, t("We couldn't open your website — check the address and try again"));
  }
  if (!codeOnPage(html, c.code)) {
    await audit(u, "claim.check", { type: "claim", id: c.id }, `${c.business.name}${dot()}code not found`, { url: page });
    return { status: "pending" as ClaimStatus, found: false };
  }
  return { status: await finish(u, c, { ...(c.evidence as object), url: page, at: Date.now() }), found: true };
}

/** A visit at the store, from the player's trusted position. */
export async function claimVisit(u: Who, claimId: string, here: LatLng) {
  const c = await myClaim(u, claimId);
  if (c.method !== "visits") throw new HttpError(400, t("This claim isn't by visits"));
  const ev = (c.evidence ?? {}) as { visits?: Visit[] };
  const r = addVisit(ev.visits ?? [], { at: Date.now(), lat: here.lat, lng: here.lng, dist: Math.round(distanceM(here, c.business)) }, S.claimSlack);
  if (!r.ok) throw new HttpError(400, r.why === "far" ? t("Go inside {place} to check in", { place: c.business.name }) : t("Come back on another day for the second visit"));
  const evidence = { ...ev, visits: r.visits };
  if (!r.done) {
    await prisma.bizClaim.update({ where: { id: c.id }, data: { evidence } });
    await audit(u, "claim.visit", { type: "claim", id: c.id }, `${c.business.name}${dot()}visit 1`);
    return { status: "pending" as ClaimStatus, visits: r.visits.length };
  }
  return { status: await finish(u, c, evidence), visits: r.visits.length };
}

/** A licence / bill photo: the claim goes to the admins. */
export async function claimDocument(u: Who, claimId: string, dataUrl: string, note = "") {
  const c = await myClaim(u, claimId);
  if (c.method !== "document") throw new HttpError(400, t("This claim isn't by document"));
  const photo = decodePhoto(dataUrl);
  await prisma.bizClaim.update({ where: { id: c.id }, data: { doc: new Uint8Array(photo.bytes), docType: photo.type, status: "review", ...(note ? { note: note.slice(0, 500) } : {}) } });
  await audit(u, "claim.document", { type: "claim", id: c.id }, `${c.business.name}${dot()}photo sent`);
  return { status: "review" as ClaimStatus };
}

// ---------------------------------------------------------------- admin
export async function adminClaims(status: "review" | "pending" | "approved" | "rejected" | "all") {
  const rows = await prisma.bizClaim.findMany({
    where: status === "all" ? {} : { status },
    orderBy: { createdAt: status === "review" ? "asc" : "desc" },
    take: 100,
    select: { ...SELECT, user: { select: { username: true, createdAt: true } }, business: { select: { name: true, address: true, website: true, lat: true, lng: true, verified: true, owner: { select: { username: true } } } } },
  });
  return rows.map((r) => ({
    ...view(r),
    risk: r.risk,
    flags: ((r.evidence as { flags?: string[] })?.flags ?? []).map((f) => t(f)),
    visitsAt: ((r.evidence as { visits?: Visit[] })?.visits ?? []).map((v) => ({ at: new Date(v.at).toISOString(), dist: v.dist })),
    url: (r.evidence as { url?: string })?.url ?? "",
    user: r.user.username,
    userSince: r.user.createdAt.toISOString(),
    business: { name: r.business.name, address: r.business.address, website: r.business.website, lat: r.business.lat, lng: r.business.lng, verified: r.business.verified, owner: r.business.owner.username },
  }));
}

export async function claimDoc(claimId: string) {
  const c = await prisma.bizClaim.findUnique({ where: { id: claimId }, select: { doc: true, docType: true } });
  return c?.doc ? { bytes: c.doc, type: c.docType || "image/jpeg" } : null;
}

/** Approve (verify; a dispute hands the store over) or turn down, with the reason the owner sees. */
export async function decideClaim(admin: Who, claimId: string, approve: boolean, reason = "") {
  const c = await prisma.bizClaim.findUnique({ where: { id: claimId }, select: { ...SELECT, business: { select: { id: true, name: true, ownerId: true } } } });
  if (!c) throw new HttpError(404, t("Claim not found"));
  if (c.status === "approved" || c.status === "rejected") throw new HttpError(409, t("Already decided"));
  await prisma.bizClaim.update({ where: { id: c.id }, data: { status: approve ? "approved" : "rejected", decision: reason.slice(0, 300), reviewerId: admin.id, decidedAt: new Date() } });
  if (approve) {
    if (c.dispute) {
      const was = c.business.ownerId;
      await prisma.business.update({ where: { id: c.businessId }, data: { ownerId: c.userId } });
      await notify(was, () => ({ kind: "info", title: t("{place} was handed to its proven owner", { place: c.business.name }), body: reason || undefined }));
    }
    await markVerified(c.businessId, c.method);
  }
  await audit(admin, approve ? (c.dispute ? "admin.transfer" : "admin.verify") : "admin.reject", { type: "claim", id: c.id }, `${c.business.name}${reason ? ` · ${reason}` : ""}`, { businessId: c.businessId });
  await notify(c.userId, () =>
    approve
      ? { kind: "info", link: "biz", title: t("✅ {place} is verified — it shows the tick on the map", { place: c.business.name }) }
      : { kind: "info", link: "biz", title: t("❌ We couldn't verify {place}", { place: c.business.name }), body: reason || t("Try another way to prove it") },
  );
  return { ok: true };
}
