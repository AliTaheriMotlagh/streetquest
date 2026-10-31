// The service worker's "you're offline" answer (sw.js offlineJson, x-offline) reaches the
// player in their language, not as the worker's English (client.ts errorText).
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { registerMessages, setLocaleResolver } from "@/lib/i18n";
import fa from "@/lib/i18n/fa";
import { errorText } from "@/components/game/client";

const offline = () => new Response("{}", { status: 503, headers: { "x-offline": "1" } });
const english = { error: "You're offline — this will work again when you're back online", code: "offline" };

describe("errors shown to the player", () => {
  it("translates the service worker's offline answer", () => {
    registerMessages("fa", fa);
    setLocaleResolver(() => "fa");
    try {
      assert.equal(errorText(offline(), english), fa["You're offline — try again when you're back online"]);
    } finally {
      setLocaleResolver(() => "en");
    }
    assert.equal(errorText(offline(), english), "You're offline — try again when you're back online");
  });

  it("passes the server's own (already translated) error through", () => {
    assert.equal(errorText(new Response("{}", { status: 400 }), { error: "خطا" }), "خطا");
    assert.equal(errorText(new Response("{}", { status: 500 }), {}), undefined);
  });
});
