// The admin car lab's checks (drive/carCheck.ts) on the drawn cars: every one passes.
import assert from "node:assert/strict";
import { before, it, mock } from "node:test";
import * as THREE from "three";
import { FLEET, type FleetKey } from "@/lib/fleet";
import { checkCar } from "@/components/drive/carCheck";
import { fleetParts } from "@/components/drive/fleet3d";

before(() => {
  const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: "" };
  (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  mock.method(console, "warn", () => {});
});

it("every drawn car: parts the right way out, cabin inside the glass, wheels on the ground", () => {
  for (const key of Object.keys(FLEET) as FleetKey[]) {
    const c = checkCar(fleetParts(key));
    assert.deepEqual(c.issues.filter((i) => i.code !== "heavy"), [], `${key}: ${JSON.stringify(c.issues)}`);
    assert.ok(c.tris > 0 && c.parts.length >= 5, key);
  }
});

it("a part turned inside out is flagged", () => {
  const p = { ...fleetParts("samand") };
  const w = p.wheel.clone().toNonIndexed();
  const a = w.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i + 2 < a.count; i += 3) for (let j = 0; j < 3; j++) {
    const t = a.getComponent(i + 1, j);
    a.setComponent(i + 1, j, a.getComponent(i + 2, j));
    a.setComponent(i + 2, j, t);
  }
  const issues = checkCar({ ...p, wheel: w }).issues;
  assert.ok(issues.some((i) => i.code === "insideOut" && i.part === "wheel"), JSON.stringify(issues));
});
