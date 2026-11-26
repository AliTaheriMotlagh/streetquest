// What a seller lists, checked before buyers see it (pure; tests/moderation.test.ts). The decision table
// (BACKLOG.md): post-moderation plus automatic pre-checks, a report button, and a new seller's first
// listings held for a moderator. So:
//  - **block** (refused outright, the seller is told why): things that can't be sold here at all —
//    weapons, drugs, alcohol, adult content, gambling, counterfeit/hacked goods, forged papers;
//  - **hold** (saved, hidden from buyers until a moderator looks — Admin → Listings): a seller's first
//    HOLD_FIRST listings, a price far off the seller's own range, contact details or links stuffed into
//    the text (deals should go through the shop's phone/pay link), shouting and spam patterns, a copy of
//    another of the seller's listings;
//  - otherwise **ok**: live at once (post-moderation: reports bring it back to a moderator).
// app/api/shops/products runs it on create and on edits that change what buyers read; buyers only ever
// see `review: "ok"` (server/shops.ts, /s/<id>, sitemap, orders).

import { msg } from "../i18n";

/** A listing's moderation state. */
export type Review = "ok" | "pending" | "rejected";
export const REVIEWS: Review[] = ["ok", "pending", "rejected"];

/** A seller's first listings wait for a moderator (after that: post-moderation). */
export const HOLD_FIRST = 3;
/** Reports from this many different players hide a listing until a moderator looks. */
export const HIDE_AFTER_REPORTS = 3;

/** Why a player reports a listing (Admin → Listings shows the reason). */
export const REPORT_REASONS = ["scam", "prohibited", "offensive", "wrongPrice", "spam", "other"] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];
/** Why a listing waits (stored in reviewNote, " · "-joined; translated where shown). */
export const HELD_BY_REPORTS = msg("Reported by several players");
export const REASON_LABEL: Record<ReportReason, string> = {
  scam: msg("Scam or fraud"),
  prohibited: msg("Not allowed to be sold"),
  offensive: msg("Offensive"),
  wrongPrice: msg("Misleading price"),
  spam: msg("Spam"),
  other: msg("Something else"),
};

/** Persian and Arabic letters folded, digits to Latin, lower case, zero-width joiners and tatweel out. */
export function fold(s: string): string {
  return s
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ۀة]/g, "ه")
    .replace(/[‌‍ـ]/g, "")
    .toLowerCase();
}

/**
 * Words (Persian and English, already folded) that mean the listing can't be here. Whole words or clear
 * stems, so "gun" doesn't catch "begun" and "شراب" doesn't catch "شرابه"; words with an everyday meaning too
 * ("شیشه" is glass, "bullet" a journal) are left out. Toy and replica guns, airsoft, game skins, "non-alcoholic",
 * and the like are let through below (ALLOWED).
 */
const BLOCK: { cat: string; re: RegExp }[] = [
  { cat: "weapons", re: /(^|[^a-z])(guns?|pistols?|rifles?|ammunition|grenades?|firearms?|kalashnikov|ak[- ]?47|silencer)([^a-z]|$)|(^|\s)(اسلحه|سلاح گرم|کلت|کلاشنیکف|فشنگ|مهمات|نارنجک|تفنگ جنگی)(\s|$)/ },
  { cat: "drugs", re: /(^|[^a-z])(cocaine|heroin|meth|crystal meth|opium|hashish|marijuana|cannabis|mdma|ecstasy|lsd|tramadol)([^a-z]|$)|(^|\s)(تریاک|هروئین|کراک|حشیش|گراس|ماری ?جوانا|ترامادول|قرص روانگردان)(\s|$)/ },
  { cat: "alcohol", re: /(^|[^a-z])(vodka|whisky|whiskey|arak|beer|wine|liquor)([^a-z]|$)|(^|\s)(مشروب|عرق سگی|ودکا|ویسکی|شراب|آبجو الکلی)(\s|$)/ },
  { cat: "adult", re: /(^|[^a-z])(porn|xxx|escort|sex ?toy|nude|onlyfans)([^a-z]|$)|(^|\s)(پورن|سکس|همخوابی|صیغه یابی)(\s|$)/ },
  { cat: "gambling", re: /(^|[^a-z])(casino|betting|bet site|poker chips? real money)([^a-z]|$)|(^|\s)(کازینو|شرط ?بندی|سایت بت|پیش ?بینی فوتبال)(\s|$)/ },
  { cat: "fakes", re: /(^|[^a-z])(counterfeit|fake (passport|id|license|degree)|hacked account|cracked account|stolen)([^a-z]|$)|(^|\s)(مدرک جعلی|پاسپورت جعلی|گواهینامه جعلی|اکانت هک|کارت ملی جعلی|سرقتی)(\s|$)/ },
];
/** Harmless uses of the words above (a toy gun, alcohol-free beer, a cocktail glass, a water pistol). */
const ALLOWED = /toy|replica|airsoft|water ?pistol|nerf|non-?alcoholic|alcohol-?free|0[.,]0%|glue gun|heat gun|nail gun|spray gun|massage gun|glass|skin|in-?game|game item|اسباب ?بازی|آیتم بازی|اسکین|ماکت|تفنگ آبپاش|بدون الکل|ماءالشعیر|تفنگ چسب|تفنگ حرارتی/;

/** An Iranian or international phone number written into the text. */
const PHONE = /(\+?98|0)?9\d{9}\b|\b0\d{2,3}[ -]?\d{7,8}\b|\+\d{10,14}/;
/** A link or a handle elsewhere: deals then happen off the platform, where scams do. */
const LINK = /https?:\/\/|www\.|\.(ir|com|net|org|me)\b|t\.me\/|wa\.me\/|instagram\.com|@[a-z0-9_.]{4,}|تلگرام|واتس ?اپ|اینستا(گرام)?|ایتا|روبیکا/;

export type ListingIn = { title: string; description: string; price: number; currency: "coins" | "toman" };
export type SellerCtx = {
  /** The seller's listings a moderator has already let through (or that were ok from the start). */
  approved: number;
  /** The seller's other listings' titles and descriptions (for copies), and their prices in this currency (for outliers). */
  others: { title: string; description: string; price: number; currency: "coins" | "toman" }[];
  /** A trusted seller (a verified business, an admin): no first-listings hold. */
  trusted?: boolean;
};
export type Verdict = { verdict: "ok" | "hold" | "block"; /** Keys for t(): why (shown to the seller for a block, to moderators for a hold). */ reasons: string[]; /** What category a block is in. */ cat?: string };

const words = (s: string) => fold(s).replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/** How alike two texts are, by shared words (0…1, Jaccard). */
export function sameness(a: string, b: string): number {
  const A = new Set(words(a).split(" ").filter((w) => w.length > 1)), B = new Set(words(b).split(" ").filter((w) => w.length > 1));
  if (!A.size || !B.size) return 0;
  let both = 0;
  for (const w of A) if (B.has(w)) both++;
  return both / (A.size + B.size - both);
}

/** The listing as buyers would read it, checked: refuse, hold for a moderator, or let it through. */
export function preCheck(l: ListingIn, ctx: SellerCtx): Verdict {
  const text = ` ${words(`${l.title} ${l.description}`)} `;
  const raw = fold(`${l.title} ${l.description}`);
  if (!ALLOWED.test(raw))
    for (const b of BLOCK) if (b.re.test(text)) return { verdict: "block", reasons: [msg("This can't be sold here (weapons, drugs, alcohol, adult content, gambling, fakes)")], cat: b.cat };
  const hold: string[] = [];
  if (!ctx.trusted && ctx.approved < HOLD_FIRST) hold.push(msg("A new seller's first listings are checked by a moderator"));
  // (Digits written in groups — "0912 345 6789" — are read as one number.)
  if (PHONE.test(raw.replace(/(\d)[\s-]+(?=\d)/g, "$1"))) hold.push(msg("A phone number in the text (use the shop's phone)"));
  if (LINK.test(raw)) hold.push(msg("A link or a handle in the text (use the shop's links)"));
  const letters = l.title.replace(/[^A-Za-z]/g, "");
  if (letters.length >= 8 && letters === letters.toUpperCase()) hold.push(msg("All capitals"));
  if (/(.)\1{5,}/u.test(raw) || /([!?؟])\1{2,}/.test(raw)) hold.push(msg("Repeated letters or marks"));
  if (ctx.others.some((o) => sameness(`${o.title} ${o.description}`, `${l.title} ${l.description}`) >= 0.85)) hold.push(msg("A copy of another of your listings"));
  // A price far from the seller's own range in the same currency (10× either way, with a few to compare).
  const same = ctx.others.filter((o) => o.currency === l.currency && o.price > 0).map((o) => o.price).sort((a, b) => a - b);
  if (l.price > 0 && same.length >= 3) {
    const mid = same[same.length >> 1];
    if (l.price > mid * 10 || l.price * 10 < mid) hold.push(msg("A price far from the seller's other listings"));
  }
  return hold.length ? { verdict: "hold", reasons: hold } : { verdict: "ok", reasons: [] };
}

/** Did an edit change what buyers read (so it's checked again)? */
export const changesText = (before: Pick<ListingIn, "title" | "description" | "price">, d: Partial<ListingIn>) =>
  (d.title !== undefined && d.title !== before.title) || (d.description !== undefined && d.description !== before.description) || (d.price !== undefined && d.price !== before.price);

/**
 * The review state after a check: a block never saves; a hold waits; ok goes live — except a listing a
 * moderator turned down stays down until it's checked again (an edit puts it back in the queue).
 */
export function reviewAfter(v: Verdict, before: Review | null): Review {
  if (v.verdict === "hold") return "pending";
  if (before === "rejected") return "pending";
  return "ok";
}
