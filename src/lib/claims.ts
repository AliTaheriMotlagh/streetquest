// Proving a store is yours (pure; tests/claims.test.ts). A business on the map starts unverified;
// its owner proves it one of three ways, strongest first:
//  - website: put the code (SQ-XXXXXX) anywhere on the store's own website — the game reads the
//    page and approves at once (only someone who runs the site can do it);
//  - visits: check in at the store from the owner's phone on two different days, at least
//    VISIT_GAP_H apart — approved at once when nothing looks off, otherwise an admin looks;
//  - document: a photo of the business licence (جواز کسب), a shop sign with today's code on
//    paper, or a utility bill in the store's name — an admin checks it.
// A store someone else already runs on the game can only change hands through an admin: that claim
// is a dispute and always needs a document.
// The risk score says when an "at once" approval should wait for an admin instead.
import { msg } from "./i18n";

export type ClaimMethod = "website" | "visits" | "document";
export type ClaimStatus = "pending" | "review" | "approved" | "rejected";

export const CLAIM_METHODS: Record<ClaimMethod, { emoji: string; label: string; how: string; strength: number }> = {
  website: { emoji: "🌐", label: msg("Code on your website"), how: msg("Put the code anywhere on your store's website (a page, the footer or a meta tag), then tap Check. Approved at once."), strength: 3 },
  visits: { emoji: "📍", label: msg("Two visits at your store"), how: msg("Check in from inside your store today, and again on another day. Approved when the second visit is done."), strength: 2 },
  document: { emoji: "📄", label: msg("Licence or bill photo"), how: msg("A photo of your business licence, a bill in the store's name, or your sign with the code written on paper. Checked by our team within 2 days."), strength: 2 },
};
export const CLAIM_METHOD_KEYS = Object.keys(CLAIM_METHODS) as [ClaimMethod, ...ClaimMethod[]];

/** The second visit has to be this many hours after the first, on another (Iran) day. */
export const VISIT_GAP_H = 16;
/** A visit counts within this many metres of the store (plus GPS slack). */
export const VISIT_M = 60;
/** A claim not finished in this many days runs out. */
export const CLAIM_DAYS = 14;
/** Each player starts at most this many claims a week (stops someone claiming a whole street). */
export const CLAIMS_PER_WEEK = 5;

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** A claim code: SQ- and six letters/digits that can't be mixed up (no 0/O, 1/I). `rand` gives 0…1. */
export function claimCode(rand: () => number = Math.random): string {
  let s = "";
  for (let i = 0; i < 6; i++) s += ALPHABET[Math.floor(rand() * ALPHABET.length) % ALPHABET.length];
  return `SQ-${s}`;
}

/**
 * Is the code on this page? Anywhere in its text, attributes or a meta tag, any case, with or
 * without the dash, Persian digits or a zero-width joiner in between (some editors add them).
 */
export function codeOnPage(html: string, code: string): boolean {
  const fold = (s: string) =>
    s
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
      .replace(/[‌‍​­]/g, "")
      .replace(/[-–—\s]/g, "")
      .toUpperCase();
  return fold(html).includes(fold(code));
}

/** The website a code is read from must be the store's own (the same site, www or not). */
export function sameSite(url: string, website: string): boolean {
  try {
    const host = (u: string) => new URL(/^https?:\/\//i.test(u) ? u : `https://${u}`).hostname.replace(/^www\./, "").toLowerCase();
    return !!website && host(url) === host(website);
  } catch {
    return false;
  }
}

/** The calendar day in Iran (UTC+3:30) a moment falls on: two visits must be on different days. */
export const iranDay = (ms: number) => new Date(ms + 3.5 * 3600_000).toISOString().slice(0, 10);

export type Visit = { at: number; lat: number; lng: number; dist: number };
/**
 * What a new visit means for a visits claim: too far from the store, the same day as the last
 * visit (or too soon), counted, or the claim is done (two good visits).
 */
export function addVisit(visits: Visit[], v: Visit, slackM = 0): { ok: false; why: "far" | "soon" } | { ok: true; visits: Visit[]; done: boolean } {
  if (v.dist > VISIT_M + slackM) return { ok: false, why: "far" };
  const last = visits[visits.length - 1];
  if (last && (iranDay(last.at) === iranDay(v.at) || v.at - last.at < VISIT_GAP_H * 3600_000)) return { ok: false, why: "soon" };
  const next = [...visits, v];
  return { ok: true, visits: next, done: next.length >= 2 };
}

export type RiskInput = {
  /** Days since the player signed up. */
  accountDays: number;
  /** Their claims an admin turned down before. */
  rejected: number;
  /** Claims they started in the last week. */
  recentClaims: number;
  /** Other businesses they already run. */
  owned: number;
  /** The store is someone else's on the game. */
  dispute: boolean;
  /** The store's name on the map differs from the name the owner typed. */
  nameDiffers?: boolean;
};
/** 0 clean … ≥ RISK_REVIEW: an admin looks before it's approved (whatever the method). */
export const RISK_REVIEW = 3;
export function claimRisk(r: RiskInput): { score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 0;
  if (r.accountDays < 2) (score += 2), flags.push(msg("New account"));
  if (r.rejected > 0) (score += 2 * Math.min(2, r.rejected)), flags.push(msg("Claims turned down before"));
  if (r.recentClaims >= 3) (score += 1), flags.push(msg("Many claims this week"));
  if (r.owned >= 3) (score += 1), flags.push(msg("Runs several stores"));
  if (r.nameDiffers) (score += 1), flags.push(msg("Name differs from the map"));
  if (r.dispute) (score += 3), flags.push(msg("Store already has an owner"));
  return { score, flags };
}

/** How a finished check ends: approved at once, or waiting for an admin. */
export function settle(method: ClaimMethod, risk: number, dispute: boolean): ClaimStatus {
  if (dispute || method === "document") return "review";
  return risk >= RISK_REVIEW ? "review" : "approved";
}

export const CLAIM_STATUS: Record<ClaimStatus, { emoji: string; label: string }> = {
  pending: { emoji: "⏳", label: msg("In progress") },
  review: { emoji: "🔎", label: msg("Waiting for our team") },
  approved: { emoji: "✅", label: msg("Verified") },
  rejected: { emoji: "❌", label: msg("Not approved") },
};

/** Audit actions, grouped for the admin's filter (the prefix before the dot). */
export const AUDIT_GROUPS = ["business", "claim", "campaign", "coupon", "admin"] as const;
