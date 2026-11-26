// The Seller center's rules (lib/sellerCenter.ts): who can link what, and the to-do list, most urgent first.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { linkProblem, sellerTodos, type SellerBusiness, type SellerShop } from "@/lib/sellerCenter";

const NOW = Date.UTC(2026, 10, 26, 12);
const DAY = 86_400_000;
const shop = (over: Partial<SellerShop> = {}): SellerShop => ({ id: "s", name: "Corner", open: true, expiresAt: NOW + 20 * DAY, businessId: null, products: [{ active: true, stock: 3, review: "ok" }], pending: [], ...over });
const biz = (over: Partial<SellerBusiness & { ownerId: string }> = {}) => ({ id: "b", name: "Cafe Naderi", verified: true, plan: "free", planUntil: null, views: 0, ownerId: "u", ...over });

describe("seller center: linking", () => {
  it("only a verified business of your own, to your shop, once", () => {
    assert.equal(linkProblem(shop(), biz(), "u"), null);
    assert.equal(linkProblem(null, biz(), "u"), "no-shop");
    assert.equal(linkProblem(shop(), biz({ ownerId: "x" }), "u"), "not-yours");
    assert.equal(linkProblem(shop(), null, "u"), "not-yours");
    assert.equal(linkProblem(shop(), biz({ verified: false }), "u"), "not-verified");
    assert.equal(linkProblem(shop(), biz({ linkedElsewhere: true }), "u"), "taken");
    assert.equal(linkProblem(shop({ businessId: "b" }), biz(), "u"), "already");
  });
});

describe("seller center: to-dos", () => {
  const keys = (s: SellerShop | null, b: SellerBusiness[] = []) => sellerTodos(s, b, NOW).map((x) => x.key);
  it("nothing to do for a healthy shop; no shop: open one", () => {
    assert.deepEqual(keys(shop()), []);
    assert.deepEqual(keys(null), ["start"]);
  });
  it("urgent first: late orders, a shop closing or closed, turned-down products", () => {
    const s = shop({ pending: [NOW - 3 * DAY, NOW - 3600_000], expiresAt: NOW + 2 * DAY, products: [{ active: true, stock: 0, review: "ok" }, { active: false, stock: 1, review: "pending" }, { active: true, stock: 1, review: "rejected" }] });
    const list = sellerTodos(s, [], NOW);
    assert.deepEqual(list.map((x) => [x.key, x.urgent]), [["orders", true], ["renew", true], ["rejected", true], ["review", false], ["stock", false]]);
    assert.deepEqual(list[0].vars, { n: 2, late: 1 });
    assert.deepEqual(list[1].vars, { n: 2 });
    assert.equal(sellerTodos(shop({ expiresAt: NOW - DAY }), [], NOW)[0].text, "Your shop has closed — renew it to sell again");
    assert.ok(keys(shop({ open: false })).includes("paused"));
    assert.ok(keys(shop({ products: [] })).includes("empty"));
  });
  it("businesses: verify it, then link it; a paid plan about to end", () => {
    assert.deepEqual(keys(shop(), [biz({ verified: false })]), ["verify:b"]);
    assert.deepEqual(keys(shop(), [biz()]), ["link:b"]);
    assert.deepEqual(keys(shop({ businessId: "b" }), [biz()]), []);
    assert.deepEqual(keys(shop(), [biz({ linkedElsewhere: true })]), []);
    assert.deepEqual(keys(shop({ businessId: "b" }), [biz({ plan: "pro", planUntil: NOW + DAY })]), ["plan:b"]);
  });
});
