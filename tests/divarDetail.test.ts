// A Divar ad's page in the game (before divar.ir): read from Divar's own post page data.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { divarDetailOf } from "@/lib/localData";

// Trimmed from a real /v8/posts-v2/web/<token> answer (the widgets the page uses).
const raw = {
  sections: [
    { section_name: "BREADCRUMB", widgets: [{ widget_type: "BREADCRUMB", data: {} }] },
    {
      section_name: "TITLE",
      widgets: [
        { widget_type: "LEGEND_TITLE_ROW", data: { title: "۱۴۲ متر/ ریحانی / نوساز" } },
        { widget_type: "EXPANDABLE_SECTION", data: { widget_list: [{ widget_type: "DESCRIPTION_ROW", data: { text: "انتشار آگهی: ۱۸ آبان ۱۴۰۵\nآخرین به‌روز‌رسانی: ۲۰ آبان" } }] } },
      ],
    },
    { section_name: "DESCRIPTION", widgets: [{ widget_type: "TITLE_ROW", data: { text: "توضیحات" } }, { widget_type: "DESCRIPTION_ROW", data: { text: "سه خوابه\nدو پارکینگ" } }] },
    { section_name: "IMAGE", widgets: [{ widget_type: "IMAGE_CAROUSEL", data: { items: [{ image: { url: "https://s100.divarcdn.com/a.webp" } }, { image: { url: "https://s100.divarcdn.com/a.webp" } }, { image: { url: "http://bad/b.jpg" } }] } }] },
    {
      section_name: "LIST_DATA",
      widgets: [
        { widget_type: "GROUP_INFO_ROW", data: { items: [{ title: "متراژ", value: "۱۴۲" }, { title: "اتاق", value: "۳" }] } },
        { widget_type: "UNEXPANDABLE_ROW", data: { title: "قیمت کل", value: "۵۴,۰۰۰,۰۰۰,۰۰۰ تومان" } },
        { widget_type: "GROUP_FEATURE_ROW", data: { items: [{ title: "آسانسور" }, { title: "انباری", available: false }] } },
      ],
    },
    { section_name: "MAP", widgets: [{ widget_type: "MAP_ROW", data: { location: { type: "FUZZY", fuzzy_data: { point: { latitude: 35.75, longitude: 51.48 }, radius: 500 } } } }] },
  ],
};

describe("a Divar ad's page", () => {
  it("reads the title, when it was posted, the text, photos, facts, features and rough spot", () => {
    const d = divarDetailOf("gaxbut06", raw)!;
    assert.equal(d.title, "۱۴۲ متر/ ریحانی / نوساز");
    assert.equal(d.posted, "انتشار آگهی: ۱۸ آبان ۱۴۰۵");
    assert.equal(d.description, "سه خوابه\nدو پارکینگ");
    assert.deepEqual(d.photos, ["https://s100.divarcdn.com/a.webp"], "each photo once, https only");
    assert.deepEqual(d.facts.map((f) => f.title), ["متراژ", "اتاق", "قیمت کل"]);
    assert.deepEqual(d.features, ["آسانسور"], "what it doesn't have is left out");
    assert.deepEqual(d.at, { lat: 35.75, lng: 51.48, radius: 500 });
    assert.equal(d.url, "https://divar.ir/v/gaxbut06");
  });

  it("a removed ad (no sections, or no title) is no page", () => {
    assert.equal(divarDetailOf("x", null), null);
    assert.equal(divarDetailOf("x", { sections: [] }), null);
    assert.equal(divarDetailOf("x", { sections: [{ section_name: "DESCRIPTION", widgets: [{ widget_type: "DESCRIPTION_ROW", data: { text: "hi" } }] }] }), null);
  });
});
