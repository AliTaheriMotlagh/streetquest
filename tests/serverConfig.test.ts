import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const caddyfile = readFileSync("docker/Caddyfile", "utf8");
const compose = readFileSync("docker/compose.yml", "utf8");

test("one-server Caddyfile has a snippet for every CADDY_TLS mode (auto default + cloudflare DNS)", () => {
  assert.match(caddyfile, /import tls-\{\$CADDY_TLS:auto\}/);
  assert.match(caddyfile, /^\(tls-auto\) \{/m);
  assert.match(caddyfile, /^\(tls-cloudflare\) \{[\s\S]*?dns cloudflare \{env\.CF_DNS_API_TOKEN\}/m);
});

test("one-server compose hands Caddy its TLS mode, DNS token and the plugin image", () => {
  assert.match(compose, /CADDY_TLS: \$\{CADDY_TLS:-auto\}/);
  assert.match(compose, /CF_DNS_API_TOKEN: \$\{CF_DNS_API_TOKEN:-\}/);
  assert.match(compose, /image: streetquest-caddy:\$\{CADDY_TAG:-latest\}/);
});
