// The cars' close-up look (drive/carLook.ts) and the city materials' new patches: each patch
// finds its anchors in three.js's own shaders (a three upgrade that moves one fails here, not
// on a phone), the paint keeps its dents when patched (fleetDamage wraps onBeforeCompile and
// must stay outermost), and the tyre coordinates the tread and sidewall are drawn from.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { carGlass, carPaint, carTrim, carWheel, tyreAttr } from "@/components/drive/carLook";
import { withDents } from "@/components/drive/fleetDamage";
import { mirrored, PAINT_MIRROR } from "@/components/drive/graphics/shaders";

type Lib = "physical" | "standard" | "basic";
/** Run a material's patches over three's shader sources, as the renderer would before compiling. */
function compile(mat: THREE.Material, lib: Lib) {
  const src = THREE.ShaderLib[lib];
  const sh = { vertexShader: src.vertexShader, fragmentShader: src.fragmentShader, uniforms: THREE.UniformsUtils.clone(src.uniforms) } as unknown as THREE.WebGLProgramParametersWithUniforms;
  mat.onBeforeCompile(sh, {} as THREE.WebGLRenderer);
  return sh;
}
const count = (s: string, sub: string) => s.split(sub).length - 1;

describe("car paint", () => {
  it("patches three's physical and standard shaders, and keeps the dents when wrapped", () => {
    for (const [mat, lib] of [[new THREE.MeshPhysicalMaterial(), "physical"], [new THREE.MeshStandardMaterial(), "standard"]] as const) {
      const m = withDents(mirrored(carPaint(mat), PAINT_MIRROR));
      const sh = compile(m, lib);
      assert.ok(sh.fragmentShader.includes("sqFlake"), "metallic flakes");
      assert.ok(sh.fragmentShader.includes("sqDust"), "dirt");
      assert.ok(sh.vertexShader.includes("dentK("), "the dent wrapper still runs");
      assert.ok(sh.fragmentShader.includes("sqMirrorOn"), "screen-space reflections still marked");
      // The scratch function arrives twice (paint, dents) but is defined once.
      assert.equal(count(sh.fragmentShader, "#ifndef SQ_SCRATCH"), 2);
      assert.ok(m.customProgramCacheKey().includes("car-paint") && m.customProgramCacheKey().includes("+dent"));
      assert.ok(sh.uniforms.sqDirt && sh.uniforms.sqWet, "dirt and rain are live uniforms");
    }
  });

  it("gives the clear-coated paint a full, glassy lacquer", () => {
    const p = carPaint(new THREE.MeshPhysicalMaterial({ clearcoat: 0.5, clearcoatRoughness: 0.3 }));
    assert.equal(p.clearcoat, 1);
    assert.ok(p.clearcoatRoughness < 0.05);
  });
});

describe("car glass, trim and wheels", () => {
  it("tints the glass, keeps it findable as glass, and mirrors at a glancing angle when see-through", () => {
    const solid = carGlass(new THREE.MeshStandardMaterial());
    assert.equal(solid.name, "glass", "carDamage tells glass by its name");
    assert.equal(solid.metalness, 0);
    const clear = carGlass(new THREE.MeshStandardMaterial({ transparent: true, opacity: 0.4 }));
    assert.ok(compile(clear, "standard").fragmentShader.includes("gl_FragColor.a = clamp(mix(gl_FragColor.a, 0.96"));
  });

  it("finds its anchors for chrome trim and treaded, spoked wheels", () => {
    const trim = compile(carTrim(new THREE.MeshStandardMaterial({ vertexColors: true })), "standard");
    assert.ok(trim.fragmentShader.includes("sqChrome"));
    const wheel = compile(carWheel(new THREE.MeshStandardMaterial({ vertexColors: true })), "standard");
    assert.ok(wheel.vertexShader.includes("attribute vec3 aTyre"));
    assert.ok(wheel.fragmentShader.includes("sqGroove") && wheel.fragmentShader.includes("sqHole"));
  });

  it("measures each wheel vertex on its tyre: radius and across the tread, both 0…1", () => {
    const g = tyreAttr(new THREE.CylinderGeometry(0.31, 0.31, 0.2, 16).rotateZ(Math.PI / 2), { spokes: true });
    const a = g.getAttribute("aTyre");
    let maxR = 0, maxX = 0;
    for (let i = 0; i < a.count; i++) (maxR = Math.max(maxR, a.getX(i))), (maxX = Math.max(maxX, Math.abs(a.getY(i))));
    assert.ok(Math.abs(maxR - 1) < 1e-6 && Math.abs(maxX - 1) < 1e-6);
    assert.equal(a.getZ(0), 1, "a drawn rim: spokes cut into it");
    // A rim drawn on its own is measured against the tyre round it.
    const rim = tyreAttr(new THREE.CylinderGeometry(0.18, 0.18, 0.22, 12).rotateZ(Math.PI / 2), { R: 0.31 });
    let rimR = 0;
    for (let i = 0; i < rim.getAttribute("aTyre").count; i++) rimR = Math.max(rimR, rim.getAttribute("aTyre").getX(i));
    assert.ok(Math.abs(rimR - 0.18 / 0.31) < 1e-6);
    assert.equal(rim.getAttribute("aTyre").getZ(0), 0, "a real model's rim stays as modelled");
    // Measured once: a second call leaves it alone.
    assert.equal(tyreAttr(g, { R: 5 }).getAttribute("aTyre"), a);
  });
});
