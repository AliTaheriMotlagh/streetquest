import { test } from "node:test";
import assert from "node:assert/strict";
import { FEATURES, featureBySlug } from "../src/lib/features";
import { ICON_PATHS } from "../src/lib/iconPaths";
import fa from "../src/lib/i18n/fa";
import tr from "../src/lib/i18n/tr";

const catalogs = { fa, tr } as Record<string, Record<string, string>>;

test("feature pages: unique URL-safe slugs, real icons, links into the game", () => {
  const slugs = FEATURES.map((f) => f.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  for (const f of FEATURES) {
    assert.match(f.slug, /^[a-z0-9]+(-[a-z0-9]+)*$/);
    assert.ok(f.icon in ICON_PATHS, `${f.slug}: icon ${f.icon}`);
    assert.ok(f.play.startsWith("/play"), f.slug);
    assert.ok(f.points.length >= 3 && f.faq.length >= 2, `${f.slug}: enough to say`);
    assert.equal(featureBySlug(f.slug), f);
  }
  assert.equal(featureBySlug("nope"), null);
});

test("feature titles and descriptions fit search results in every language", () => {
  for (const f of FEATURES) {
    for (const [l, cat] of [["en", null], ...Object.entries(catalogs)] as [string, Record<string, string> | null][]) {
      const title = cat ? cat[f.title] : f.title;
      const desc = cat ? cat[f.description] : f.description;
      assert.ok(title && desc, `${l}: ${f.slug} translated`);
      assert.ok(title.length <= 70, `${l}: ${f.slug} title ${title.length} chars`);
      assert.ok(desc.length <= 175, `${l}: ${f.slug} description ${desc.length} chars`);
    }
  }
});

test("Persian feature copy uses Persian letters (ی ک), not Arabic (ي ك)", () => {
  for (const f of FEATURES) {
    const all = [f.title, f.description, f.h1, f.intro, ...f.points.flat(), ...f.faq.flat()].map((k) => fa[k] ?? "");
    for (const s of all) assert.doesNotMatch(s, /[يك]/, s.slice(0, 40));
  }
});
