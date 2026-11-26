// The separator between the bits of a line (lib/i18n dot): a bullet in Persian, where a middle dot beside a
// number reads as a zero; and no Persian translation uses the middle dot.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { it } from "node:test";
import { dot } from "@/lib/i18n";

it("a bullet in Persian, a middle dot elsewhere; no Persian translation keeps a middle dot", () => {
  assert.equal(dot("fa"), " • ");
  assert.equal(dot("en"), " · ");
  assert.equal(dot("tr"), " · ");
  const dir = join(process.cwd(), "src/lib/i18n/fa");
  const bad: string[] = [];
  for (const f of readdirSync(dir))
    for (const line of readFileSync(join(dir, f), "utf8").split("\n")) {
      const m = /^\s*"(?:[^"\\]|\\.)*":\s*"(.*)",?$/.exec(line);
      if (m && m[1].includes("·")) bad.push(`${f}: ${m[1].slice(0, 60)}`);
    }
  assert.deepEqual(bad, []);
});
