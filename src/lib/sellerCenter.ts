// The Seller center (pure; tests/sellerCenter.test.ts): one place for a seller's player shop and their real
// businesses. They're linked, not merged (decided 2026-11-17): a verified business can stand behind one shop —
// the shop then wears "Verified store" — and the claims, plans and campaigns stay on the business. The center
// also says what needs doing, most urgent first: orders to hand over, products waiting for review or sold out,
// a shop about to close, a business to verify or to link.
import { msg } from "./i18n";

const DAY = 86_400_000;
/** "Closes soon" this many days before. */
export const RENEW_SOON_DAYS = 3;
/** An order this old is late to hand over. */
export const ORDER_LATE_DAYS = 2;

export type SellerShop = {
  id: string;
  name: string;
  open: boolean;
  expiresAt: number;
  businessId: string | null;
  products: { active: boolean; stock: number; review: string }[];
  /** Pending orders' creation times (ms). */
  pending: number[];
};
export type SellerBusiness = { id: string; name: string; verified: boolean; plan: string; planUntil: number | null; views: number; /** A shop of someone's already linked to it (not this seller's). */ linkedElsewhere?: boolean };

export type LinkProblem = "no-shop" | "not-yours" | "not-verified" | "taken" | "already";
export const LINK_PROBLEMS: Record<LinkProblem, string> = {
  "no-shop": msg("Open a shop first"),
  "not-yours": msg("That business isn't yours"),
  "not-verified": msg("Verify the business first — only a verified business can stand behind a shop"),
  taken: msg("Another shop is already linked to that business"),
  already: msg("They're already linked"),
};

/** Why this business can't be linked to the seller's shop (null: it can). */
export function linkProblem(shop: Pick<SellerShop, "businessId"> | null, biz: (SellerBusiness & { ownerId: string }) | null, userId: string): LinkProblem | null {
  if (!shop) return "no-shop";
  if (!biz || biz.ownerId !== userId) return "not-yours";
  if (shop.businessId === biz.id) return "already";
  if (!biz.verified) return "not-verified";
  if (biz.linkedElsewhere) return "taken";
  return null;
}

export type TodoAction = "orders" | "products" | "renew" | "open" | "verify" | "link" | "plan" | "start";
export type Todo = { key: string; emoji: string; text: string; vars?: Record<string, string | number>; action: TodoAction; urgent: boolean; id?: string };

/** What needs doing, urgent first (then in the order below). */
export function sellerTodos(shop: SellerShop | null, businesses: SellerBusiness[], now = Date.now()): Todo[] {
  const out: Todo[] = [];
  if (shop) {
    const late = shop.pending.filter((t) => now - t > ORDER_LATE_DAYS * DAY).length;
    if (shop.pending.length) out.push({ key: "orders", emoji: "📦", text: late ? msg("{n} orders to hand over — {late} waiting over 2 days") : msg("{n} orders to hand over"), vars: { n: shop.pending.length, late }, action: "orders", urgent: late > 0 });
    const days = Math.ceil((shop.expiresAt - now) / DAY);
    if (days <= 0) out.push({ key: "renew", emoji: "⏳", text: msg("Your shop has closed — renew it to sell again"), action: "renew", urgent: true });
    else if (days <= RENEW_SOON_DAYS) out.push({ key: "renew", emoji: "⏳", text: msg("Your shop closes in {n} days — renew it"), vars: { n: days }, action: "renew", urgent: true });
    if (!shop.open && days > 0) out.push({ key: "paused", emoji: "⏸️", text: msg("Your shop is paused — buyers can't order"), action: "open", urgent: false });
    const live = shop.products.filter((p) => p.active);
    const waiting = shop.products.filter((p) => p.review === "pending").length;
    const rejected = shop.products.filter((p) => p.review === "rejected").length;
    const soldOut = live.filter((p) => p.stock === 0 && p.review !== "rejected").length;
    if (rejected) out.push({ key: "rejected", emoji: "⛔", text: msg("{n} products were turned down — see why and fix them"), vars: { n: rejected }, action: "products", urgent: true });
    if (waiting) out.push({ key: "review", emoji: "🕵️", text: msg("{n} products waiting for review"), vars: { n: waiting }, action: "products", urgent: false });
    if (soldOut) out.push({ key: "stock", emoji: "📉", text: msg("{n} products sold out — restock them"), vars: { n: soldOut }, action: "products", urgent: false });
    if (!live.length) out.push({ key: "empty", emoji: "🛒", text: msg("Your shelves are empty — add a product"), action: "products", urgent: false });
  } else out.push({ key: "start", emoji: "🏪", text: msg("Open a shop where you stand and start selling"), action: "start", urgent: false });
  for (const b of businesses) {
    if (!b.verified) out.push({ key: `verify:${b.id}`, emoji: "✅", text: msg("Verify {name} to show it as a real, checked store"), vars: { name: b.name }, action: "verify", urgent: false, id: b.id });
    else if (shop && !shop.businessId && !b.linkedElsewhere) out.push({ key: `link:${b.id}`, emoji: "🔗", text: msg("Link {name} to your shop — it'll show as a verified store"), vars: { name: b.name }, action: "link", urgent: false, id: b.id });
    if (b.plan !== "free" && b.planUntil != null && b.planUntil - now <= RENEW_SOON_DAYS * DAY && b.planUntil > now)
      out.push({ key: `plan:${b.id}`, emoji: "💳", text: msg("{name}'s plan ends in {n} days"), vars: { name: b.name, n: Math.ceil((b.planUntil - now) / DAY) }, action: "plan", urgent: false, id: b.id });
  }
  return out.map((x, i) => ({ x, i })).sort((a, b) => Number(b.x.urgent) - Number(a.x.urgent) || a.i - b.i).map(({ x }) => x);
}
