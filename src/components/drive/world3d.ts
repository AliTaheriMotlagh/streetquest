"use client";
// Look and feel of the 3D city, in two styles:
//  - "real": physically based materials, an atmospheric sky that lights and reflects
//    off glass and water, asphalt, lane markings, street lamps that glow at night;
//  - "toon": the storybook city — toon shading, pastel walls, lollipop trees.
// Tile geometry arrives as plain arrays from the build workers (tileMesh.ts) and is only
// wrapped in meshes here: a handful of draw calls per neighbourhood, props instanced.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { rng } from "@/lib/geo";
import { artFor } from "../art/emoji";
import { ICONS } from "../art/icons";
import { materialDefs, render } from "../art/kit";
import type { Footprint, Label, PropKind, Style, TileArrays } from "./tileMesh";

export type Phase = "night" | "dawn" | "day" | "dusk";
export type { Style };

// ---------------------------------------------------------------- light per phase
type Light = { top: string; horizon: string; ground: string; sun: string; sunI: number; hemi: number; hemiSky: string; fog: string; fogNear: number; fogFar: number; elev: number; exposure: number };
export const LIGHT: Record<Style, Record<Phase, Light>> = {
  real: {
    day: { top: "#4f86c6", horizon: "#c9d9e6", ground: "#7a8262", sun: "#fff3e0", sunI: 3.1, hemi: 0.95, hemiSky: "#d6e6ff", fog: "#c3d2df", fogNear: 260, fogFar: 1100, elev: 48, exposure: 0.62 },
    dawn: { top: "#56628f", horizon: "#f2b48a", ground: "#6e7556", sun: "#ffc08a", sunI: 2.1, hemi: 0.7, hemiSky: "#ffd9c2", fog: "#d9b7a3", fogNear: 220, fogFar: 950, elev: 4, exposure: 0.7 },
    dusk: { top: "#3d3f73", horizon: "#f09a6c", ground: "#666d50", sun: "#ffad73", sunI: 1.9, hemi: 0.62, hemiSky: "#ffc7b0", fog: "#c9a08e", fogNear: 220, fogFar: 950, elev: 3, exposure: 0.72 },
    night: { top: "#050914", horizon: "#1a2338", ground: "#2c3328", sun: "#9fb4ff", sunI: 0.45, hemi: 0.38, hemiSky: "#5a6c9e", fog: "#0e1626", fogNear: 120, fogFar: 650, elev: 35, exposure: 1.05 },
  },
  toon: {
    day: { top: "#5aa9ff", horizon: "#cfe9ff", ground: "#9bd27f", sun: "#fff3d6", sunI: 2.4, hemi: 1.1, hemiSky: "#ffffff", fog: "#cfe6ff", fogNear: 160, fogFar: 720, elev: 50, exposure: 1.05 },
    dawn: { top: "#6d7bd8", horizon: "#ffc6a8", ground: "#93c27a", sun: "#ffd2a0", sunI: 1.8, hemi: 0.9, hemiSky: "#ffffff", fog: "#f5cdb8", fogNear: 160, fogFar: 720, elev: 12, exposure: 1.05 },
    dusk: { top: "#4b3f9a", horizon: "#ff9e7a", ground: "#7fae6c", sun: "#ffb27a", sunI: 1.6, hemi: 0.8, hemiSky: "#ffffff", fog: "#e8a690", fogNear: 160, fogFar: 720, elev: 10, exposure: 1.05 },
    night: { top: "#141a4d", horizon: "#4b4a9a", ground: "#4f7d63", sun: "#b9c8ff", sunI: 1.25, hemi: 1.0, hemiSky: "#8a9cff", fog: "#3a3a7a", fogNear: 160, fogFar: 720, elev: 40, exposure: 1.05 },
  },
};

// ---------------------------------------------------------------- textures
let gradient: THREE.DataTexture | null = null;
/** 3-step toon ramp, shared by every toon material. */
export function toonRamp() {
  if (gradient) return gradient;
  const data = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  gradient = new THREE.DataTexture(data, 3, 1, THREE.RGBAFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.needsUpdate = true;
  return gradient;
}
export const toon = (o: THREE.MeshToonMaterialParameters = {}) => new THREE.MeshToonMaterial({ gradientMap: toonRamp(), ...o });

const canvas = (w: number, h = w) => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return { c, g: c.getContext("2d")! };
};
const tex = (c: HTMLCanvasElement, srgb = true) => {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
};

/**
 * Façade: a 4×4 block of window bays (one bay = one texture repeat in tileMesh's UVs, so
 * the texture repeats at ¼). White where the wall is (the vertex colour paints it).
 * `lit`: the emissive mask — warm light in some windows, black elsewhere.
 */
function facade(style: Style, lit: boolean) {
  const S = 256, B = S / 4;
  const { c, g } = canvas(S);
  const r = rng(lit ? 11 : 7);
  g.fillStyle = lit ? "#000" : "#fff";
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const bx = x * B, by = y * B;
      if (style === "toon") {
        const wx = bx + 16, wy = by + 18, ww = 32, wh = 28;
        if (lit) g.fillStyle = r() < 0.55 ? (r() < 0.5 ? "#ffd37a" : "#ffe9b0") : "#000";
        else g.fillStyle = "#7fa8d8";
        g.fillRect(wx, wy, ww, wh);
        if (!lit) (g.fillStyle = "rgba(255,255,255,.7)"), g.fillRect(wx + 4, wy + 4, 10, 8);
        continue;
      }
      const wx = bx + 15, wy = by + 13, ww = 34, wh = 38;
      if (lit) {
        const on = r() < 0.42;
        g.fillStyle = on ? (r() < 0.6 ? "#ffcf8a" : r() < 0.5 ? "#fff1d0" : "#cfe2ff") : "#000";
        g.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
        continue;
      }
      // Frame, glass with a sky reflection gradient, a sill, sometimes blinds.
      g.fillStyle = "#d9d6cf";
      g.fillRect(wx - 3, wy - 3, ww + 6, wh + 6);
      const grd = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
      grd.addColorStop(0, "#5e7186");
      grd.addColorStop(0.55, "#2f3b48");
      grd.addColorStop(1, "#46566a");
      g.fillStyle = grd;
      g.fillRect(wx, wy, ww, wh);
      if (r() < 0.3) {
        g.fillStyle = "rgba(225,214,190,.85)";
        g.fillRect(wx, wy, ww, wh * (0.25 + r() * 0.5));
      }
      g.fillStyle = "#cfcac0";
      g.fillRect(wx + ww / 2 - 1, wy, 2, wh);
      g.fillStyle = "#bdb8ae";
      g.fillRect(wx - 5, wy + wh + 2, ww + 10, 4);
    }
  const t = tex(c);
  t.repeat.set(0.25, 0.25);
  t.magFilter = style === "toon" ? THREE.NearestFilter : THREE.LinearFilter;
  return t;
}

/** Glass curtain wall: panels and mullions; lit panels at night. */
function curtain(lit: boolean) {
  const S = 256, B = S / 4;
  const { c, g } = canvas(S);
  const r = rng(lit ? 5 : 3);
  g.fillStyle = lit ? "#000" : "#e8eef4";
  g.fillRect(0, 0, S, S);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      if (lit) {
        // Office lights: a few panes, and never the whole pane (blinds, desks, frames).
        g.fillStyle = r() < 0.28 ? (r() < 0.5 ? "#a8916a" : "#7f8ea8") : "#000";
        g.fillRect(x * B + 8, y * B + 10, B - 16, B - 22);
        continue;
      }
      const shade = 150 + Math.floor(r() * 50);
      g.fillStyle = `rgb(${shade - 20},${shade},${shade + 18})`;
      g.fillRect(x * B + 3, y * B + 3, B - 6, B - 6);
    }
  const t = tex(c);
  t.repeat.set(0.25, 0.25);
  return t;
}

/** Asphalt / ground grain: soft noise around white, so it only darkens the vertex colour. */
function grain(lo: number, speckle: number, seed: number) {
  const S = 256;
  const { c, g } = canvas(S);
  const img = g.createImageData(S, S);
  const r = rng(seed);
  for (let i = 0; i < S * S; i++) {
    let v = lo + (1 - lo) * r();
    if (r() < speckle) v *= 0.7;
    const b = Math.round(v * 255);
    img.data.set([b, b, b, 255], i * 4);
  }
  g.putImageData(img, 0, 0);
  // Blur a touch so it reads as texture, not static.
  g.globalAlpha = 0.5;
  g.drawImage(c, 1, 0);
  g.drawImage(c, 0, 1);
  return tex(c);
}

// ---------------------------------------------------------------- materials
export type Materials = ReturnType<typeof makeMaterials>;
export function makeMaterials(style: Style) {
  const off = (f: number) => ({ polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f });
  if (style === "toon") {
    const m = {
      walls: toon({ map: facade("toon", false), vertexColors: true, emissiveMap: facade("toon", true), emissive: new THREE.Color("#ffcf6b"), emissiveIntensity: 0 }),
      glass: toon({ map: facade("toon", false), vertexColors: true }),
      roofs: toon({ vertexColors: true, side: THREE.DoubleSide }),
      roads: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, ...off(-2) }),
      marks: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, ...off(-3) }),
      ground: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, ...off(-1) }),
      water: new THREE.MeshPhongMaterial({ color: "#52b8ef", side: THREE.DoubleSide, shininess: 90, specular: new THREE.Color("#ffffff"), transparent: true, opacity: 0.92, ...off(-1) }),
      trees: toon({ vertexColors: true }),
      props: toon({ vertexColors: true }),
      glow: new THREE.MeshBasicMaterial({ color: "#fff2c0" }),
    };
    return withDispose(m);
  }
  const m = {
    walls: new THREE.MeshStandardMaterial({ map: facade("real", false), vertexColors: true, roughness: 0.86, metalness: 0, emissiveMap: facade("real", true), emissive: new THREE.Color("#ffd9a0"), emissiveIntensity: 0 }),
    glass: new THREE.MeshStandardMaterial({ map: curtain(false), vertexColors: true, roughness: 0.12, metalness: 0.75, emissiveMap: curtain(true), emissive: new THREE.Color("#ffe6b8"), emissiveIntensity: 0, envMapIntensity: 1.2 }),
    roofs: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }),
    roads: new THREE.MeshStandardMaterial({ vertexColors: true, map: grain(0.8, 0.06, 21), roughness: 0.93, side: THREE.DoubleSide, ...off(-2) }),
    marks: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, ...off(-3) }),
    ground: new THREE.MeshStandardMaterial({ vertexColors: true, map: grain(0.78, 0.02, 33), roughness: 1, side: THREE.DoubleSide, ...off(-1) }),
    water: new THREE.MeshStandardMaterial({ color: "#2f5f7c", roughness: 0.06, metalness: 0.35, side: THREE.DoubleSide, transparent: true, opacity: 0.94, ...off(-1) }),
    trees: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true }),
    props: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 }),
    glow: new THREE.MeshBasicMaterial({ color: "#6b6150" }),
  };
  return withDispose(m);
}

function withDispose<T extends Record<string, THREE.Material>>(m: T) {
  return {
    ...m,
    dispose() {
      for (const mat of Object.values(m)) {
        const s = mat as THREE.MeshStandardMaterial;
        s.map?.dispose();
        s.emissiveMap?.dispose();
        mat.dispose();
      }
    },
  };
}

/** Lit windows and street lamps: 0 by day, 1 at night. */
export function setNight(mats: Materials, style: Style, night: number) {
  mats.walls.emissiveIntensity = night * (style === "real" ? 1.6 : 1.1);
  if ("emissiveIntensity" in mats.glass) mats.glass.emissiveIntensity = night * 0.9;
  mats.glow.color.set(night > 0.3 ? "#ffd58a" : style === "real" ? "#6b6150" : "#fff2c0");
}

// ---------------------------------------------------------------- sky
/** The toon gradient dome (also the real style's night sky, with stars). */
function gradientSky() {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new THREE.Color() }, horizon: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0.4, 0.5, -0.6).normalize() }, sunCol: { value: new THREE.Color() }, stars: { value: 0 }, sunSize: { value: 600 } },
    vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; uniform vec3 sunCol; uniform float stars; uniform float sunSize; varying vec3 vDir;
      float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164))) * 43758.5453); }
      void main(){
        float h = clamp(vDir.y, 0.0, 1.0);
        vec3 c = mix(horizon, top, pow(h, 0.6));
        float s = max(dot(vDir, sunDir), 0.0);
        c += sunCol * (pow(s, sunSize) * 1.5 + pow(s, 12.0) * 0.25);
        vec3 g = floor(vDir * 260.0);
        float st = step(0.9965, hash(g)) * stars * smoothstep(0.05, 0.4, vDir.y);
        c += vec3(st);
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
  mesh.frustumCulled = false;
  return { mesh, mat };
}

/**
 * The sky dome, its lighting and (real style) the environment map that glass, paint and
 * water reflect. `apply(phase)` re-lights everything for the time of day.
 */
export function makeSkySystem(renderer: THREE.WebGLRenderer, scene: THREE.Scene, style: Style) {
  const grad = gradientSky();
  scene.add(grad.mesh);
  let atmo: Sky | null = null;
  if (style === "real") {
    atmo = new Sky();
    atmo.scale.setScalar(1800);
    atmo.frustumCulled = false;
    const u = atmo.material.uniforms;
    u.turbidity.value = 6;
    u.rayleigh.value = 1.4;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.85;
    scene.add(atmo);
  }
  const sunDir = new THREE.Vector3();
  const pmrem = style === "real" ? new THREE.PMREMGenerator(renderer) : null;
  let env: THREE.WebGLRenderTarget | null = null;

  const apply = (phase: Phase) => {
    const L = LIGHT[style][phase];
    const el = THREE.MathUtils.degToRad(L.elev), az = THREE.MathUtils.degToRad(phase === "dusk" ? 250 : phase === "dawn" ? 110 : 200);
    sunDir.set(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
    grad.mat.uniforms.top.value.set(L.top);
    grad.mat.uniforms.horizon.value.set(L.horizon);
    grad.mat.uniforms.sunCol.value.set(L.sun);
    grad.mat.uniforms.sunDir.value.copy(sunDir);
    grad.mat.uniforms.stars.value = phase === "night" ? 1 : 0;
    grad.mat.uniforms.sunSize.value = phase === "night" && style === "real" ? 2400 : 600;
    const atmoOn = !!atmo && phase !== "night";
    if (atmo) {
      atmo.visible = atmoOn;
      atmo.material.uniforms.sunPosition.value.copy(sunDir);
    }
    grad.mesh.visible = !atmoOn;
    if (pmrem) {
      // Reflections: render the sky alone into a prefiltered environment map.
      const envScene = new THREE.Scene();
      const sky = atmoOn ? atmo!.clone() : grad.mesh.clone();
      sky.visible = true;
      envScene.add(sky);
      const next = pmrem.fromScene(envScene, 0, 0.1, 2000);
      env?.dispose();
      env = next;
      scene.environment = env.texture;
      scene.environmentIntensity = phase === "night" ? 0.35 : 0.9;
    }
    renderer.toneMappingExposure = L.exposure;
    return { L, sunDir };
  };

  return {
    apply,
    follow(p: THREE.Vector3) {
      grad.mesh.position.copy(p);
      atmo?.position.copy(p);
    },
    dispose() {
      grad.mat.dispose();
      grad.mesh.geometry.dispose();
      atmo?.material.dispose();
      atmo?.geometry.dispose();
      env?.dispose();
      pmrem?.dispose();
    },
  };
}

export function makeClouds(n: number) {
  const group = new THREE.Group();
  const mat = toon({ color: "#ffffff", transparent: true, opacity: 0.95 });
  const parts: THREE.BufferGeometry[] = [];
  const r = rng(99);
  for (let k = 0; k < 5; k++) {
    const g = new THREE.IcosahedronGeometry(8 + r() * 6, 1);
    g.translate((k - 2) * 9 + r() * 4, r() * 4, r() * 6);
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  const puff = mergeGeometries(parts, false)!;
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(puff, mat);
    m.position.set((r() - 0.5) * 1400, 140 + r() * 80, (r() - 0.5) * 1400);
    m.scale.setScalar(0.7 + r() * 0.9);
    m.userData.speed = 1.5 + r() * 2;
    group.add(m);
  }
  return { group, mat, geo: puff };
}

// ---------------------------------------------------------------- street furniture
/** Paint every vertex one colour and drop index/uv so pieces merge cleanly. */
export function paint(g: THREE.BufferGeometry, c: string) {
  const col = new THREE.Color(c);
  const n = g.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) a.set([col.r, col.g, col.b], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(a, 3));
  const out = g.index ? g.toNonIndexed() : g;
  out.deleteAttribute("uv");
  return out;
}
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => (g.translate(x, y, z), g);

export type Templates = ReturnType<typeof makeTemplates>;
/** One geometry per kind of prop, shared by every tile's instanced meshes. */
export function makeTemplates(style: Style) {
  const real = style === "real";
  const tree = real
    ? mergeGeometries([
        paint(at(new THREE.CylinderGeometry(0.17, 0.27, 3.2, 6), 0, 1.6, 0), "#8a7a68"),
        paint(at(new THREE.IcosahedronGeometry(1.7, 0), 0, 3.9, 0), "#ffffff"),
        paint(at(new THREE.IcosahedronGeometry(1.35, 0), 0.8, 4.9, 0.3), "#f0f4ec"),
        paint(at(new THREE.IcosahedronGeometry(1.2, 0), -0.7, 4.6, -0.4), "#e6ece0"),
        paint(at(new THREE.IcosahedronGeometry(1.0, 0), 0.1, 5.8, -0.1), "#f6faf2"),
      ])!
    : mergeGeometries([
        paint(at(new THREE.CylinderGeometry(0.22, 0.32, 2.4, 6), 0, 1.2, 0), "#b98a62"),
        paint(at(new THREE.IcosahedronGeometry(1.9, 1), 0, 3.6, 0), "#ffffff"),
        paint(at(new THREE.IcosahedronGeometry(1.25, 1), 0.3, 5.0, 0.2), "#f4fff0"),
      ])!;
  const metal = real ? "#4a4f55" : "#5b6080";
  // Lamps: pole on the pavement, arm reaching out over the street (+z), glowing head.
  const lamp = mergeGeometries([
    paint(at(new THREE.CylinderGeometry(0.07, 0.11, 6.6, 6), 0, 3.3, 0), metal),
    paint(at(new THREE.BoxGeometry(0.09, 0.09, 1.7), 0, 6.55, 0.8), metal),
    paint(at(new THREE.BoxGeometry(0.42, 0.14, 0.62), 0, 6.5, 1.6), metal),
  ])!;
  const lampHead = paint(at(new THREE.BoxGeometry(0.34, 0.05, 0.52), 0, 6.41, 1.6), "#ffffff");
  // Traffic light: a pole and a three-lamp head facing the road (+z).
  const signal = mergeGeometries([
    paint(at(new THREE.CylinderGeometry(0.08, 0.1, 3.6, 6), 0, 1.8, 0), "#3a3d42"),
    paint(at(new THREE.BoxGeometry(0.36, 1.05, 0.3), 0, 3.95, 0), "#25272b"),
    paint(at(new THREE.BoxGeometry(0.2, 0.2, 0.05), 0, 4.28, 0.17), "#ff3b30"),
    paint(at(new THREE.BoxGeometry(0.2, 0.2, 0.05), 0, 3.95, 0.17), "#ffb020"),
    paint(at(new THREE.BoxGeometry(0.2, 0.2, 0.05), 0, 3.62, 0.17), "#34d058"),
  ])!;
  // Bus shelter: open toward the road (−z), back panel and roof.
  const bus = mergeGeometries([
    paint(at(new THREE.BoxGeometry(3.2, 0.1, 1.5), 0, 2.45, 0), real ? "#5d636b" : "#ff7a59"),
    paint(at(new THREE.BoxGeometry(3.2, 2.2, 0.06), 0, 1.3, 0.7), real ? "#9fb6c4" : "#bfe8ff"),
    paint(at(new THREE.BoxGeometry(0.08, 2.4, 0.08), -1.55, 1.2, -0.65), metal),
    paint(at(new THREE.BoxGeometry(0.08, 2.4, 0.08), 1.55, 1.2, -0.65), metal),
    paint(at(new THREE.BoxGeometry(2.2, 0.08, 0.45), 0, 0.5, 0.4), "#7a5a3a"),
    paint(at(new THREE.BoxGeometry(0.5, 0.5, 0.06), 1.1, 2.75, -0.7), "#2e7dd1"),
  ])!;
  const all = { tree, lamp, lampHead, signal, bus };
  return { ...all, dispose: () => Object.values(all).forEach((g) => g.dispose()) };
}

// ---------------------------------------------------------------- a tile's meshes
export type TileMeshes = {
  group: THREE.Group;
  /** Street furniture: hidden when the tile is far away. */
  detail: THREE.Group;
  footprints: Footprint[];
  roads: Float32Array[];
  roadWidths: number[];
  roadKinds: TileArrays["roadKinds"];
  roadNames: (string | null)[];
  roadDrawn: boolean[];
  labels: Label[];
  real: boolean;
  dispose: () => void;
};

export function tileMeshes(a: TileArrays, mats: Materials, tpl: Templates, opts: { shadows: boolean }): TileMeshes {
  const group = new THREE.Group();
  const detail = new THREE.Group();
  group.add(detail);
  const geoms: THREE.BufferGeometry[] = [];
  for (const l of a.layers) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(l.pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(l.nor, 3));
    g.setAttribute("color", new THREE.BufferAttribute(l.col, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(l.uv, 2));
    g.setIndex(new THREE.BufferAttribute(l.idx, 1));
    g.computeBoundingSphere();
    geoms.push(g);
    const mesh = new THREE.Mesh(g, mats[l.name]);
    const solid = l.name === "walls" || l.name === "glass" || l.name === "roofs";
    mesh.castShadow = opts.shadows && solid;
    mesh.receiveShadow = opts.shadows && l.name !== "water";
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
  }
  const insts: THREE.InstancedMesh[] = [];
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, p: { mats: Float32Array; cols: Float32Array | null }, shadow: boolean) => {
    const n = p.mats.length / 16;
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.instanceMatrix = new THREE.InstancedBufferAttribute(p.mats, 16);
    if (p.cols) m.instanceColor = new THREE.InstancedBufferAttribute(p.cols, 3);
    m.castShadow = shadow && opts.shadows;
    m.computeBoundingSphere();
    m.matrixAutoUpdate = false;
    detail.add(m);
    insts.push(m);
  };
  const byKind: Record<PropKind, THREE.BufferGeometry> = { tree: tpl.tree, lamp: tpl.lamp, signal: tpl.signal, bus: tpl.bus };
  for (const p of a.props) {
    inst(byKind[p.kind], p.kind === "tree" ? mats.trees : mats.props, p, p.kind === "tree");
    if (p.kind === "lamp") inst(tpl.lampHead, mats.glow, { mats: p.mats, cols: null }, false);
  }
  return {
    group,
    detail,
    footprints: a.footprints,
    roads: a.roads,
    roadWidths: a.roadWidths,
    roadKinds: a.roadKinds,
    roadNames: a.roadNames,
    roadDrawn: a.roadDrawn,
    labels: a.labels,
    real: a.real,
    dispose() {
      for (const g of geoms) g.dispose();
      for (const m of insts) m.dispose();
      group.clear();
    },
  };
}

// ---------------------------------------------------------------- icons, signs, labels
const EMOJI_FONT = `"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
const TEXT_FONT = `system-ui, -apple-system, "Segoe UI", Vazirmatn, sans-serif`;

const artImages = new Map<string, Promise<HTMLImageElement | null>>();
/** The game's drawn art for an emoji (art kit), as an image — or null if there's none. */
function artImage(emoji: string): Promise<HTMLImageElement | null> {
  const key = artFor(emoji);
  if (!key || !ICONS[key]) return Promise.resolve(null);
  let p = artImages.get(key);
  if (!p) {
    p = new Promise((resolve) => {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-4 -4 72 72" width="160" height="160"><defs>${materialDefs()}</defs>${render(ICONS[key])}</svg>`;
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    });
    artImages.set(key, p);
  }
  return p;
}

/** Draw an emoji now, and swap in its art-kit drawing when that's ready. */
function drawIcon(g: CanvasRenderingContext2D, emoji: string, x: number, y: number, size: number, done: () => void) {
  g.save();
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `${Math.round(size * 0.8)}px ${EMOJI_FONT}`;
  g.fillText(emoji, x, y + size * 0.05);
  g.restore();
  void artImage(emoji).then((img) => {
    if (!img) return;
    g.clearRect(x - size / 2, y - size / 2, size, size);
    g.drawImage(img, x - size / 2, y - size / 2, size, size);
    done();
  });
}

/** A big icon floating over a beacon or marker. */
export function makeIcon(emoji: string) {
  const { c, g } = canvas(160);
  g.shadowColor = "rgba(0,0,0,.35)";
  g.shadowBlur = 10;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  drawIcon(g, emoji, 80, 80, 140, () => (t.needsUpdate = true));
  const mat = new THREE.SpriteMaterial({ map: t, depthWrite: false, fog: false });
  const s = new THREE.Sprite(mat);
  s.scale.set(4.2, 4.2, 1);
  return { sprite: s, dispose: () => (t.dispose(), mat.dispose()) };
}

/** Icon + text on a rounded pill, as a camera-facing sprite. */
export function makeSign(emoji: string, text: string, color: string, opts: { big?: boolean; sub?: string } = {}) {
  const H = opts.big ? 96 : 64;
  const font = `800 ${Math.round(H * 0.4)}px ${TEXT_FONT}`;
  const probe = canvas(4).g;
  probe.font = font;
  const label = text.length > 28 ? `${text.slice(0, 27)}…` : text;
  const w = Math.min(1024, Math.ceil(probe.measureText(label).width + H * 1.5));
  const { c, g } = canvas(w, H);
  const r = H / 2;
  g.fillStyle = "rgba(18,18,30,.82)";
  g.beginPath();
  if (g.roundRect) g.roundRect(2, 2, w - 4, H - 4, r - 2);
  else g.rect(2, 2, w - 4, H - 4);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = color;
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (emoji) drawIcon(g, emoji, H * 0.5, H / 2, H * 0.72, () => (t.needsUpdate = true));
  g.font = font;
  g.fillStyle = "#fff";
  g.textBaseline = "middle";
  g.direction = /[؀-ۿ]/.test(label) ? "rtl" : "ltr";
  g.textAlign = g.direction === "rtl" ? "right" : "left";
  g.fillText(label, g.direction === "rtl" ? w - H * 0.3 : emoji ? H * 0.95 : H * 0.4, H / 2 + 1);
  const mat = new THREE.SpriteMaterial({ map: t, depthWrite: false, fog: false });
  const s = new THREE.Sprite(mat);
  const scale = opts.big ? 3.4 : 2.2;
  s.scale.set((w / H) * scale, scale, 1);
  s.renderOrder = 5;
  return { sprite: s, dispose: () => (t.dispose(), mat.dispose()) };
}

/** A street's name painted flat on the asphalt, the way navigation apps show it. */
export function makeStreetLabel(text: string, roadW: number, style: Style) {
  const H = 64;
  const font = `700 ${Math.round(H * 0.62)}px ${TEXT_FONT}`;
  const probe = canvas(4).g;
  probe.font = font;
  const w = Math.min(1024, Math.ceil(probe.measureText(text).width + 24));
  const { c, g } = canvas(w, H);
  g.font = font;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.direction = /[؀-ۿ]/.test(text) ? "rtl" : "ltr";
  g.lineWidth = 6;
  g.strokeStyle = style === "real" ? "rgba(0,0,0,.55)" : "rgba(40,40,80,.6)";
  g.strokeText(text, w / 2, H / 2 + 2);
  g.fillStyle = style === "real" ? "rgba(255,255,255,.92)" : "#ffffff";
  g.fillText(text, w / 2, H / 2 + 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true });
  const height = Math.min(3.2, Math.max(1.6, roadW * 0.34));
  const geo = new THREE.PlaneGeometry((w / H) * height, height);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.order = "YXZ";
  mesh.renderOrder = 2;
  return { mesh, dispose: () => (t.dispose(), mat.dispose(), geo.dispose()) };
}

// ---------------------------------------------------------------- beacons, markers, loot
let pillarGeo: THREE.CylinderGeometry | null = null;
let ringGeo: THREE.RingGeometry | null = null;
const pillar = () =>
  (pillarGeo ??= (() => {
    const g = new THREE.CylinderGeometry(2.2, 2.2, 90, 20, 1, true);
    g.translate(0, 45, 0);
    return g;
  })());
const ring = () => (ringGeo ??= new THREE.RingGeometry(5.2, 6.2, 40));

/**
 * Something to go to: an icon over a ring on the ground, a name sign, and (`tall`) a
 * column of light you can see across the city. Jobs and big targets get the column.
 */
export function makeBeacon(emoji: string, color: string, label: string, opts: { tall?: boolean; size?: number } = {}) {
  const tall = opts.tall ?? true, size = opts.size ?? 1;
  const group = new THREE.Group();
  const col = new THREE.Color(color);
  let pillarMat: THREE.ShaderMaterial | null = null;
  if (tall) {
    pillarMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      uniforms: { color: { value: col }, time: { value: 0 } },
      vertexShader: "varying float vY; void main(){ vY = position.y / 90.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "uniform vec3 color; uniform float time; varying float vY; void main(){ float a = (1.0 - vY) * 0.5 * (0.8 + 0.2 * sin(time * 3.0 + vY * 12.0)); gl_FragColor = vec4(color, a); }",
    });
    const p = new THREE.Mesh(pillar(), pillarMat);
    p.scale.set(size, 1, size);
    group.add(p);
  }
  const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
  const r = new THREE.Mesh(ring(), ringMat);
  r.rotation.x = -Math.PI / 2;
  r.position.y = 0.2;
  r.scale.setScalar(size * (tall ? 1 : 0.55));
  const icon = makeIcon(emoji);
  const iconY = tall ? 9 : 5.2;
  icon.sprite.scale.setScalar(4.2 * size * (tall ? 1 : 0.8));
  icon.sprite.position.y = iconY * size;
  const sign = makeSign("", label, color, { big: tall });
  sign.sprite.position.y = (tall ? 14 : 8.2) * size;
  group.add(r, icon.sprite, sign.sprite);
  return {
    group,
    icon: icon.sprite,
    sign: sign.sprite,
    tick(t: number) {
      if (pillarMat) pillarMat.uniforms.time.value = t;
      const k = (t * 0.8) % 1;
      r.scale.setScalar(size * (tall ? 1 : 0.55) * (0.6 + k * 0.8));
      ringMat.opacity = 0.9 * (1 - k);
      icon.sprite.position.y = (iconY + Math.sin(t * 2.2 + group.position.x) * 0.5) * size;
    },
    dispose() {
      pillarMat?.dispose();
      ringMat.dispose();
      icon.dispose();
      sign.dispose();
    },
  };
}

/** Floating loot (coins, chests, food) you drive through to collect. */
export function makeLoot(emoji: string, color: string) {
  const group = new THREE.Group();
  const icon = makeIcon(emoji);
  icon.sprite.scale.set(3, 3, 1);
  icon.sprite.position.y = 2.4;
  const glowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending });
  const glow = new THREE.Mesh(ring(), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.scale.setScalar(0.3);
  glow.position.y = 0.15;
  group.add(icon.sprite, glow);
  return {
    group,
    icon: icon.sprite,
    tick(t: number) {
      icon.sprite.position.y = 2.4 + Math.sin(t * 3 + group.position.x) * 0.35;
    },
    dispose() {
      icon.dispose();
      glowMat.dispose();
    },
  };
}

// ---------------------------------------------------------------- party game pieces
/** A checkpoint gate across the road: a glowing ring you drive through, with its number. */
export function makeGate(n: number) {
  const group = new THREE.Group();
  const geo = new THREE.TorusGeometry(7, 0.55, 10, 40);
  const mat = new THREE.MeshBasicMaterial({ color: "#ffd23f", transparent: true, opacity: 0.9 });
  const torus = new THREE.Mesh(geo, mat);
  torus.position.y = 6.2;
  const num = makeSign("🏁", `${n}`, "#ffd23f");
  num.sprite.position.y = 14.6;
  group.add(torus, num.sprite);
  return {
    group,
    set(state: "next" | "later" | "done") {
      mat.color.set(state === "next" ? "#ffd23f" : state === "done" ? "#3dff8f" : "#9aa3b5");
      mat.opacity = state === "later" ? 0.35 : state === "done" ? 0.25 : 0.95;
      num.sprite.visible = state !== "done";
    },
    tick(t: number) {
      torus.rotation.z = Math.sin(t * 1.5) * 0.05;
    },
    dispose() {
      geo.dispose();
      mat.dispose();
      num.dispose();
    },
  };
}

let coinGeo: THREE.CylinderGeometry | null = null;
/** A spinning gold coin for Coin Rush. */
export function makeCoin() {
  coinGeo ??= (() => {
    const g = new THREE.CylinderGeometry(1.3, 1.3, 0.28, 24);
    g.rotateX(Math.PI / 2);
    return g;
  })();
  const mat = new THREE.MeshStandardMaterial({ color: "#ffcf3a", metalness: 0.85, roughness: 0.25, emissive: new THREE.Color("#7a5200"), emissiveIntensity: 0.6 });
  const mesh = new THREE.Mesh(coinGeo, mat);
  mesh.position.y = 1.8;
  return {
    mesh,
    tick(t: number) {
      mesh.rotation.y = t * 3 + mesh.position.x;
      mesh.position.y = 1.8 + Math.sin(t * 2.5 + mesh.position.z) * 0.25;
    },
    dispose: () => mat.dispose(),
  };
}

// ---------------------------------------------------------------- storefronts
type Trade = { emoji: string; bg: [string, string]; fg: string };
const TRADES: [RegExp, Trade][] = [
  [/^(restaurant|fast_food|food_court|cafe|bakery|ice_cream|confectionery|pastry|deli|juice|bar|pub|coffee)$/, { emoji: "🍽️", bg: ["#c0392b", "#8e1f14"], fg: "#fff" }],
  [/^(pharmacy|chemist|clinic|doctors|dentist|hospital|veterinary|medical_supply|optician|laboratory)$/, { emoji: "⚕️", bg: ["#1e8f5a", "#0f5c38"], fg: "#fff" }],
  [/^(bank|atm|bureau_de_change|money_lender|insurance)$/, { emoji: "🏦", bg: ["#1f4f9a", "#12305e"], fg: "#fff" }],
  [/^(supermarket|convenience|grocery|greengrocer|butcher|general|kiosk|seafood|dairy|beverages|nuts)$/, { emoji: "🛒", bg: ["#2e9e44", "#1b6b2c"], fg: "#fff" }],
  [/^(clothes|clothing_store|shoes|boutique|jewelry|bag|fabric|tailor|fashion|watches)$/, { emoji: "👗", bg: ["#a83279", "#6e1d4f"], fg: "#fff" }],
  [/^(mobile_phone|electronics|computer|telecommunication|hifi|appliance)$/, { emoji: "📱", bg: ["#2c3e50", "#151f29"], fg: "#7fd6ff" }],
  [/^(hairdresser|beauty|cosmetics|perfumery|massage)$/, { emoji: "💇", bg: ["#7d3c98", "#4e2560"], fg: "#fff" }],
  [/^(school|university|college|kindergarten|educational_institution|library|books|stationery)$/, { emoji: "📚", bg: ["#d4a017", "#946f0d"], fg: "#1b1300" }],
  [/^(place_of_worship|muslim|mosque|christian|church)$/, { emoji: "🕌", bg: ["#17806d", "#0d5248"], fg: "#fff" }],
  [/^(hotel|lodging|hostel|guest_house|motel)$/, { emoji: "🏨", bg: ["#5b2c6f", "#381a45"], fg: "#ffd98a" }],
  [/^(fuel|car|car_repair|car_parts|tyres|car_wash)$/, { emoji: "🚗", bg: ["#e67e22", "#a8560f"], fg: "#fff" }],
  [/^(fitness_centre|sports_centre|sports|swimming_pool|stadium)$/, { emoji: "💪", bg: ["#c0392b", "#7b2218"], fg: "#fff" }],
  [/^(police|fire_station|townhall|town_hall|courthouse|government|post_office)$/, { emoji: "🏛️", bg: ["#34495e", "#1d2833"], fg: "#fff" }],
  [/^(florist|garden_centre)$/, { emoji: "💐", bg: ["#27ae60", "#16733f"], fg: "#fff" }],
  [/^(hardware|doityourself|paint|furniture|interior_decoration|houseware|carpet)$/, { emoji: "🔧", bg: ["#8e5a2b", "#5c3817"], fg: "#fff" }],
  [/^(travel_agency|taxi|estate_agent)$/, { emoji: "✈️", bg: ["#2980b9", "#1a5276"], fg: "#fff" }],
  [/^(office|company|lawyer|notary|publisher|ngo|diplomatic|association)$/, { emoji: "🏢", bg: ["#4a5560", "#2a3138"], fg: "#e8eef5" }],
  [/^(parking)$/, { emoji: "🅿️", bg: ["#1f5fbf", "#123a75"], fg: "#fff" }],
  [/^(cinema|theatre|arts_centre|museum|gallery)$/, { emoji: "🎬", bg: ["#6c3483", "#40204e"], fg: "#ffd98a" }],
];
const tradeOf = (cls = ""): Trade => TRADES.find(([re]) => re.test(cls))?.[1] ?? { emoji: "🏪", bg: ["#3d4b59", "#222b33"], fg: "#fff" };
const SIGN_FONT = `Vazirmatn, "Vazir", Tahoma, system-ui, -apple-system, "Segoe UI", sans-serif`;
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";

export type Board = { group: THREE.Group; mat: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial; dispose: () => void };

/**
 * A shop's sign board: the trade's colours, its icon and the real name (right-to-left
 * for Persian), on a slim box against the wall — lit from inside at night.
 */
export function makeShopSign(text: string, cls: string | undefined, width: number, style: Style, opts: { pole?: boolean } = {}): Board {
  const tr = tradeOf(cls);
  const H = 1.0, W = width;
  const ch = 128, cw = Math.min(1024, Math.round((W / H) * ch));
  const { c, g } = canvas(cw, ch);
  const grd = g.createLinearGradient(0, 0, 0, ch);
  grd.addColorStop(0, tr.bg[0]);
  grd.addColorStop(1, tr.bg[1]);
  g.fillStyle = grd;
  g.fillRect(0, 0, cw, ch);
  g.strokeStyle = "rgba(255,255,255,.35)";
  g.lineWidth = 4;
  g.strokeRect(4, 4, cw - 8, ch - 8);
  const rtl = /[\u0590-\u08ff]/.test(text);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  // Icon on the reading side's start, name filling the rest (shrunk to fit).
  const iconX = rtl ? cw - ch * 0.55 : ch * 0.55;
  drawIcon(g, tr.emoji, iconX, ch / 2, ch * 0.62, () => (t.needsUpdate = true));
  let size = ch * 0.5;
  g.font = `800 ${size}px ${SIGN_FONT}`;
  const room = cw - ch * 1.25;
  while (g.measureText(text).width > room && size > ch * 0.24) {
    size -= 2;
    g.font = `800 ${size}px ${SIGN_FONT}`;
  }
  g.fillStyle = tr.fg;
  g.textBaseline = "middle";
  g.direction = rtl ? "rtl" : "ltr";
  g.textAlign = "center";
  g.shadowColor = "rgba(0,0,0,.35)";
  g.shadowBlur = 4;
  g.fillText(text, rtl ? (cw - ch * 1.05) / 2 : ch * 1.05 + (cw - ch * 1.05) / 2, ch / 2 + 2, room);
  const geo = new THREE.PlaneGeometry(W, H);
  const mat = style === "real" ? new THREE.MeshStandardMaterial({ map: t, emissive: new THREE.Color("#ffffff"), emissiveMap: t, emissiveIntensity: 0.15, roughness: 0.5 }) : new THREE.MeshBasicMaterial({ map: t });
  const face = new THREE.Mesh(geo, mat);
  face.position.z = 0.07;
  const boxGeo = new THREE.BoxGeometry(W + 0.08, H + 0.08, 0.12);
  const boxMat = new THREE.MeshStandardMaterial({ color: "#1d2126", roughness: 0.6, metalness: 0.4 });
  const box = new THREE.Mesh(boxGeo, boxMat);
  const group = new THREE.Group();
  group.add(box, face);
  const extra: { dispose: () => void }[] = [];
  if (opts.pole) {
    // Two-sided on a pole: a second face on the back, and the pole itself.
    const back = face.clone();
    back.rotation.y = Math.PI;
    back.position.z = -0.07;
    group.add(back);
    const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 2.1, 8);
    poleGeo.translate(0, -H / 2 - 1.05, 0);
    group.add(new THREE.Mesh(poleGeo, boxMat));
    extra.push(poleGeo);
  }
  return { group, mat, dispose: () => (t.dispose(), mat.dispose(), geo.dispose(), boxGeo.dispose(), boxMat.dispose(), extra.forEach((e) => e.dispose())) };
}

/** A house-number plaque: Tehran's blue enamel plate with white digits. */
export function makePlaque(num: string, persianDigits: boolean): Board {
  const text = persianDigits ? num.replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]) : num;
  const { c, g } = canvas(128, 96);
  g.fillStyle = "#1c4fa0";
  g.beginPath();
  if (g.roundRect) g.roundRect(3, 3, 122, 90, 12);
  else g.rect(3, 3, 122, 90);
  g.fill();
  g.strokeStyle = "#ffffff";
  g.lineWidth = 5;
  g.stroke();
  g.fillStyle = "#ffffff";
  g.font = `800 52px ${SIGN_FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 64, 52, 110);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(0.42, 0.32);
  const mat = new THREE.MeshBasicMaterial({ map: t });
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, mat));
  return { group, mat, dispose: () => (t.dispose(), mat.dispose(), geo.dispose()) };
}
