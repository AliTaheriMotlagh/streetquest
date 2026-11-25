// Places that aren't shops (lib/storeKinds.ts civicKind / isShop): mosques, schools, hospitals, police,
// banks, offices… get a place card, no shopkeeper, no wares on the sign, no walking in to buy.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CIVIC_LOOK, civicKind, emergencyNumber, isShop } from "@/lib/storeKinds";

describe("civicKind", () => {
  it("reads the map's class first", () => {
    assert.equal(civicKind("muslim", "x"), "mosque");
    assert.equal(civicKind("place_of_worship", "x"), "worship");
    assert.equal(civicKind("school", ""), "school");
    assert.equal(civicKind("university", ""), "university");
    assert.equal(civicKind("hospital", ""), "hospital");
    assert.equal(civicKind("dentist", ""), "clinic");
    assert.equal(civicKind("police", ""), "police");
    assert.equal(civicKind("fire_station", ""), "fire");
    assert.equal(civicKind("bank", ""), "bank");
    assert.equal(civicKind("post_office", ""), "post");
    assert.equal(civicKind("townhall", ""), "government");
    assert.equal(civicKind("grave_yard", ""), "cemetery");
  });

  it("falls back to the name, in Persian, English and Turkish", () => {
    assert.equal(civicKind("", "مسجد جامع"), "mosque");
    assert.equal(civicKind("", "حسینیه ارشاد"), "mosque");
    assert.equal(civicKind("", "Sultanahmet Camii"), "mosque");
    assert.equal(civicKind("", "کلیسای وانک"), "worship");
    assert.equal(civicKind("", "دبستان شهید بهشتی"), "school");
    assert.equal(civicKind("", "مهد‌کودک گل‌ها"), "school");
    assert.equal(civicKind("", "دانشگاه تهران"), "university");
    assert.equal(civicKind("", "بیمارستان میلاد"), "hospital");
    assert.equal(civicKind("", "کلانتری ۱۰۴"), "police");
    assert.equal(civicKind("", "ایستگاه آتش‌نشانی ۱۲"), "fire");
    assert.equal(civicKind("", "بانک ملت شعبه ولیعصر"), "bank");
    assert.equal(civicKind("", "پست بانک"), "bank");
    assert.equal(civicKind("", "اداره پست مرکزی"), "post");
    assert.equal(civicKind("", "شهرداری منطقه ۶"), "government");
    assert.equal(civicKind("", "کتابخانه ملی"), "library");
  });

  it("leaves real shops alone — even ones with a bank-like name", () => {
    assert.equal(civicKind("gift", "کادویی سیب"), null);
    assert.equal(civicKind("", "بانک موبایل ایرانیان"), null, "a phone shop called 'mobile bank'");
    assert.equal(civicKind("", "بانک دیجیتال کالا"), null);
    assert.equal(civicKind("bakery", "نانوایی سنگکی"), null);
    assert.equal(isShop("bakery", "نانوایی سنگکی"), true);
    assert.equal(isShop("bank", "Bank Melli"), false);
    assert.equal(isShop("", "مسجد"), false);
  });

  it("has a look for every kind", () => {
    for (const k of ["mosque", "worship", "school", "university", "hospital", "clinic", "police", "fire", "bank", "post", "library", "government", "cemetery"] as const) assert.ok(CIVIC_LOOK[k].emoji && CIVIC_LOOK[k].label);
  });
});

describe("emergencyNumber", () => {
  it("knows Iran's numbers and 112 elsewhere; none for a school", () => {
    assert.equal(emergencyNumber("police", "IR"), "110");
    assert.equal(emergencyNumber("fire", "IR"), "125");
    assert.equal(emergencyNumber("hospital", "IR"), "115");
    assert.equal(emergencyNumber("clinic", "TR"), "112");
    assert.equal(emergencyNumber("police", "US"), "911");
    assert.equal(emergencyNumber("school", "IR"), null);
    assert.equal(emergencyNumber("mosque", "IR"), null);
  });
});
