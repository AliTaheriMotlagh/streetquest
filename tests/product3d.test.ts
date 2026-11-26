import { test } from "node:test";
import assert from "node:assert/strict";
import { amountOf, classify, CONFIDENT, fitInto, isKind, KIND_NAMES, KINDS, normText, sizeOf, wantsAi } from "../src/lib/product3d/kinds";
import { afterFailure, AUTO_LIVE, backoffMs, claimable, fullPhoto, gameLook, isProductKey, LEASE_MS, MAX_ATTEMPTS, PIPE_V, productKey, REVIEW, scoreModel, statusForScore, type Job } from "../src/lib/product3d/pipeline";
import { readAnswer, SCHEMA, searchText, SYSTEM, userPrompt } from "../src/lib/product3d/classifyPrompt";

const k = (title: string, store: Parameters<typeof classify>[1] = "restaurant", section = "") => classify({ title, section }, store).kind;

test("classify: the head noun wins, toppings don't mislead", () => {
  assert.equal(k("ساندویچ خوراک بندری با قارچ و پنیر پیتزا", "fastfood"), "sandwich");
  assert.equal(k("همبرگر با قارچ و پنیر پیتزا", "fastfood"), "burger");
  assert.equal(k("پیتزا پپرونی ۳۰ سانتی", "fastfood"), "pizza");
  assert.equal(k("چلو کباب کوبیده"), "kebabPlate");
  assert.equal(k("چلو خورشت قورمه سبزی"), "stew");
  assert.equal(k("زرشک پلو با مرغ"), "riceDish");
  assert.equal(k("حلیم یک پرس"), "soup");
  assert.equal(k("دیزی سنگی"), "dizi");
  assert.equal(k("املت"), "omelette");
  assert.equal(k("چاپاتا مرغ و قارچ", "cafe"), "sandwich");
});

test("classify: drinks by container, cafés' cups, Persian spellings", () => {
  assert.equal(k("نوشابه قوطی کوکا کولا"), "can");
  assert.equal(k("نوشابه بطری فانتا"), "bottle");
  assert.equal(k("دوغ شیشه ای آبعلی"), "glassBottle");
  assert.equal(k("دوغ محلی"), "doogh");
  assert.equal(k("آب معدنی کوچک"), "water");
  assert.equal(k("آیس لاته", "cafe"), "coldCup");
  assert.equal(k("لاته", "cafe"), "coffee");
  assert.equal(k("چای سیاه", "cafe"), "tea");
  assert.equal(k("شربت زعفران", "cafe"), "coldCup");
  assert.equal(k("نوشابه‌ی قوطی"), "can", "ZWNJ is a space");
  assert.equal(normText("كيك ۱۲"), "کیک 12");
});

test("classify: fresh words only where things are sold fresh; packs in supermarkets", () => {
  assert.equal(k("سیب زمینی سرخ کرده", "fastfood"), "fries");
  assert.equal(k("سیب زمینی ۱ کیلوگرم", "produce", "صیفی جات"), "fruit");
  assert.equal(k("کدو حلوایی ۲ کیلوگرم", "produce"), "melon");
  assert.equal(k("فیله ۴ تکه", "fastfood", "سوخاری"), "friedChicken");
  assert.equal(k("چای کیسه ای ۱۰۰ عددی", "market"), "box");
  assert.equal(k("سوهان باقلوایی ۵۰۰ گرم", "sweets"), "sohan");
  assert.equal(k("زعفران یک مثقال", "market"), "saffron");
  assert.equal(k("قلمه زامیفولیا", "general"), "plant");
  assert.equal(k("کیفیت عالی", "fashion"), "shirt", "«کیفیت» is not a bag: the store's goods");
});

test("classify: unknown words fall back to the store, marked unsure", () => {
  const c = classify({ title: "وینگزی پارتی" }, "fastfood");
  assert.ok(c.conf < CONFIDENT);
  assert.equal(c.by, "store");
  for (const name of KIND_NAMES) assert.ok(isKind(name));
});

test("sizes follow the title (litres, kilos, pizza cm) and fit a shelf spot", () => {
  assert.deepEqual(amountOf("نوشابه ۱.۵ لیتری"), { litres: 1.5 });
  assert.deepEqual(amountOf("دوغ ۳۰۰ سی‌سی"), { litres: 0.3 });
  assert.deepEqual(amountOf("برنج ۱۰ کیلویی"), { kg: 10 });
  assert.ok(sizeOf("bottle", "نوشابه ۱.۵ لیتری")[1] > sizeOf("bottle", "نوشابه ۳۰۰ سی سی")[1]);
  assert.equal(sizeOf("pizza", "پیتزا ۲۸ سانتی")[0], 0.28);
  const f = fitInto([0.6, 0.02, 0.3], 0.32, 0.36, 0.3);
  assert.ok(f.size[0] <= 0.32 + 1e-9 && f.scale < 1);
  assert.equal(fitInto([0.1, 0.1, 0.1], 1, 1, 1).scale, 1, "never scaled up");
  assert.equal(wantsAi("pizza", ""), false);
  assert.equal(wantsAi("pizza", "ai"), true);
  assert.equal(wantsAi("can", "template"), false);
});

test("product keys: same photo = same product in any size or store; else by name", () => {
  const a = productKey({ title: "x", photo: "https://cdn.snappfood.ir/200x201/cdn/48/75/85/product_image/vendor/0de.jpg" });
  const b = productKey({ title: "y", photo: "https://cdn.snappfood.ir/640x640/cdn/48/75/85/product_image/vendor/0de.jpg?x=1" });
  assert.equal(a, b);
  assert.ok(isProductKey(a) && a.startsWith("p"));
  assert.equal(productKey({ title: "کیك" }), productKey({ title: "کیک" }));
  assert.ok(productKey({ title: "کیک" }).startsWith("t"));
  assert.equal(fullPhoto("https://cdn.snappfood.ir/200x201/cdn/a.jpg"), "https://cdn.snappfood.ir/640x640/cdn/a.jpg");
});

const job = (o: Partial<Job> = {}): Job => ({ status: "queued", attempts: 0, nextTry: 0, leaseUntil: null, v: 0, locked: false, kind: "can", strategy: "", image: "https://x/y.jpg", en: "", ...o });

test("claimable: queue, backoff, leases, versions, locks, templates", () => {
  const now = 1e12;
  assert.ok(claimable(job(), now));
  assert.ok(!claimable(job({ kind: "pizza" }), now), "a template kind is never reconstructed");
  assert.ok(claimable(job({ kind: "pizza", strategy: "ai" }), now));
  assert.ok(!claimable(job({ locked: true }), now));
  assert.ok(!claimable(job({ image: "" }), now));
  assert.ok(claimable(job({ image: "", en: "cola can" }), now), "no photo: searched by its English name");
  assert.ok(!claimable(job({ status: "failed", attempts: 1, nextTry: now + 1 }), now));
  assert.ok(claimable(job({ status: "failed", attempts: 1, nextTry: now - 1 }), now));
  assert.ok(!claimable(job({ status: "failed", attempts: MAX_ATTEMPTS }), now));
  assert.ok(!claimable(job({ status: "working", leaseUntil: now + LEASE_MS }), now));
  assert.ok(claimable(job({ status: "working", leaseUntil: now - 1 }), now), "a dead runner's lease runs out");
  assert.ok(!claimable(job({ status: "live", v: PIPE_V }), now));
  assert.ok(claimable(job({ status: "live", v: PIPE_V - 1 }), now), "a new recipe redoes old models");
});

test("failures back off, permanent ones go to the template", () => {
  assert.ok(backoffMs(2) > backoffMs(1));
  assert.ok(backoffMs(10) <= 24 * 3600_000 * 1.2);
  assert.equal(afterFailure({ attempts: 1 }, "cutout", "p1", 0).status, "template");
  assert.equal(afterFailure({ attempts: 1 }, "image", "p1", 0).status, "failed");
  assert.equal(afterFailure({ attempts: MAX_ATTEMPTS }, "timeout", "p1", 0).status, "template");
});

test("scoring: a clean can goes live, a blob of specks doesn't", () => {
  const good = scoreModel("can", { triangles: 5000, bytes: 120_000, box: [1, 1.8, 1], fg: 0.4, parts: 1, colorVar: 0.12 });
  assert.ok(good.score >= AUTO_LIVE, String(good.score));
  assert.equal(statusForScore(good.score), "live");
  const bad = scoreModel("can", { triangles: 5000, bytes: 120_000, box: [3, 0.3, 3], fg: 0.02, parts: 40, colorVar: 0.005 });
  assert.ok(bad.score < REVIEW, String(bad.score));
  assert.ok(bad.why.includes("proportions") && bad.why.includes("pieces"));
  assert.deepEqual(gameLook({ status: "review", url: "/m.glb", kind: "can" }), { model: null, kind: "can" });
  assert.deepEqual(gameLook({ status: "live", url: "/m.glb", kind: "can" }), { model: "/m.glb", kind: "can" });
});

test("LLM prompt and answer: only listed kinds, lines matched by number", () => {
  const items = [{ key: "pa", title: "وینگزی پارتی", section: "پک", about: "", storeKind: "fastfood" }, { key: "pb", title: "سمنو", section: "", about: "", storeKind: "sweets" }];
  assert.match(userPrompt(items), /^1\. وینگزی پارتی \| پک \| fastfood\n2\. سمنو/);
  assert.ok(SYSTEM.includes("friedChicken") && SCHEMA.properties.items.items.properties.kind.enum.length === KIND_NAMES.length);
  const out = readAnswer(items, '```json {"items":[{"i":1,"kind":"friedChicken","en":"chicken party pack!"},{"i":2,"kind":"spaceship","en":"x"},{"i":9,"kind":"can","en":"y"}]}');
  assert.deepEqual(out, [{ key: "pa", kind: "friedChicken", en: "chicken party pack" }]);
  assert.deepEqual(readAnswer(items, "not json"), []);
  assert.equal(searchText("نوشابه ۱.۵ لیتری کوکا (خانواده)"), "نوشابه کوکا خانواده");
});

test("every kind has a sane size and photo mapping", () => {
  for (const name of KIND_NAMES) {
    const s = KINDS[name];
    assert.ok(s.size.every((x) => x > 0 && x < 1), name);
    assert.ok(["top", "front", "card", "none"].includes(s.photo), name);
  }
});
