"use client";
// Look and feel of the 3D city, in two styles:
//  - "real": physically based materials, an atmospheric sky that lights and reflects
//    off glass and water, asphalt, lane markings, street lamps that glow at night;
//  - "toon": the storybook city — toon shading, pastel walls, lollipop trees.
// What each tier adds (graphics/quality.ts): relief, glossy glass and grime on façades,
// detailed asphalt and slabs that get wet with puddles in the rain, a cloud layer, trees
// in the wind, light pools under the lamps at night.
// Tile geometry arrives as plain arrays from the build workers (tileMesh.ts) and is only
// wrapped in meshes here: a handful of draw calls per neighbourhood, props instanced.
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { rng } from "@/lib/geo";
import { artFor } from "../art/emoji";
import { ICONS } from "../art/icons";
import { materialDefs, render } from "../art/kit";
import { after, DISPLAY, displayReferred, mirrored, patchShader, swap } from "./graphics/shaders";
import { heightToNormal, surfaces } from "./graphics/surfaces";
import { FACADES, type Footprint, type Label, type PropKind, type Style, type TileArrays } from "./tileMesh";
import { treeVariant } from "@/lib/streetProps";
import { nameLines, oneLine, tradeOf } from "./trades";

export type Phase = "night" | "dawn" | "day" | "dusk";
export type { Style };

// ---------------------------------------------------------------- light per phase
export type Light = { top: string; horizon: string; ground: string; sun: string; sunI: number; hemi: number; hemiSky: string; fog: string; fogNear: number; fogFar: number; elev: number; exposure: number };
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

/**
 * The real style's façades, one layer each in FACADES order (tileMesh.ts): plaster, brick,
 * Tehran's travertine stone, concrete panels, metal cladding, and a ground floor of shop
 * windows. Like `facade`, a 4×4 block of bays per layer. RGB is the picture; alpha says
 * where the vertex colour (the wall's paint) applies — the wall, never the glass, frames or
 * mortar. `lit`: the night mask, windows in the same places as the picture.
 */
function facadeLayers(lit: boolean) {
  const S = 256, B = S / 4;
  const data = new Uint8Array(S * S * 4 * FACADES.length);
  // Surface (day layers only): per texel normal, roughness and metalness, from a relief
  // painted alongside the picture — R height, G glass, B window frame.
  const surf = lit ? null : new Uint8Array(S * S * 4 * FACADES.length);
  FACADES.forEach((kind, layer) => {
    const { g } = canvas(S);
    const mask = canvas(S);
    const m = mask.g;
    const relief = canvas(S).g;
    const r = rng(lit ? 101 + layer : 31 + layer);
    g.fillStyle = lit ? "#000" : "#fff";
    g.fillRect(0, 0, S, S);
    m.fillStyle = "#000";
    m.fillRect(0, 0, S, S);
    relief.fillStyle = "rgb(200,0,0)";
    relief.fillRect(0, 0, S, S);
    /** Relief: `h` height (0–255, wall 200), glass and frame flags. */
    const hp = (x: number, y: number, w: number, h: number, height: number, glass = 0, frame = 0) => {
      relief.fillStyle = `rgb(${height},${glass},${frame})`;
      relief.fillRect(x, y, w, h);
    };
    /** Painted in its own colour, not the wall's (glass, frames, mortar). */
    const own = (x: number, y: number, w: number, h: number, col: string) => {
      g.fillStyle = col;
      g.fillRect(x, y, w, h);
      m.fillStyle = "#fff";
      m.fillRect(x, y, w, h);
    };
    if (!lit) {
      // The wall between the windows, around white so the paint colour shows through.
      if (kind === "plaster")
        for (let i = 0; i < 900; i++) {
          const x = r() * S, y = r() * S;
          g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.03})`;
          g.fillRect(x, y, 2, 2);
          hp(x, y, 2, 2, 186 + Math.floor(r() * 24));
        }
      if (kind === "brick")
        for (let y = 0; y < S; y += 5) {
          for (let x = (y / 5) % 2 ? -6 : 0; x < S; x += 13) {
            const v = 222 + Math.floor(r() * 33);
            g.fillStyle = `rgb(${v},${v},${v})`;
            g.fillRect(x, y, 12, 4);
            hp(x, y, 12, 4, 205 + Math.floor(r() * 18));
          }
          own(0, y + 4, S, 1, "#c9c3b8");
          hp(0, y + 4, S, 1, 150);
        }
      if (kind === "stone")
        for (let y = 0; y < S; y += 16) {
          for (let x = (y / 16) % 2 ? -20 : 0; x < S; x += 40) {
            const v = 232 + Math.floor(r() * 23);
            g.fillStyle = `rgb(${v},${v},${v - 4})`;
            g.fillRect(x + 1, y + 1, 39, 15);
            hp(x + 1, y + 1, 39, 15, 206 + Math.floor(r() * 8));
            // Travertine's little holes and veins.
            for (let k = 0; k < 6; k++) {
              const hx = x + 2 + r() * 34, hy = y + 2 + r() * 11, hw = 2 + r() * 4;
              (g.fillStyle = "rgba(120,100,70,.18)"), g.fillRect(hx, hy, hw, 1);
              hp(hx, hy, hw, 1, 185);
            }
          }
          g.fillStyle = "rgba(90,80,60,.28)";
          g.fillRect(0, y, S, 1);
          hp(0, y, S, 1, 165);
        }
      if (kind === "concrete") {
        for (let y = 0; y < S; y += 32) (g.fillStyle = "rgba(0,0,0,.16)"), g.fillRect(0, y, S, 2), hp(0, y, S, 2, 160);
        for (let x = 0; x < S; x += 64) (g.fillStyle = "rgba(0,0,0,.12)"), g.fillRect(x, 0, 2, S), hp(x, 0, 2, S, 160);
        for (let i = 0; i < 40; i++) (g.fillStyle = `rgba(60,60,60,${0.03 + r() * 0.05})`), g.fillRect(r() * S, r() * S, 3, 10 + r() * 30);
      }
      if (kind === "metal") for (let y = 0; y < S; y += 6) (g.fillStyle = "rgba(0,0,0,.13)"), g.fillRect(0, y, S, 2), hp(0, y, S, 2, 165, 0, 255);
      if (kind === "metal") for (let y = 0; y < S; y += 6) hp(0, y + 2, S, 4, 205, 0, 255);
    }
    for (let y = 0; y < 4; y++)
      for (let x = 0; x < 4; x++) {
        const bx = x * B, by = y * B;
        if (kind === "shopfront") {
          // A shop window under a sign band, a door in every other bay; all lit at night.
          const wx = bx + 4, wy = by + 15, ww = B - 8, wh = B - 17;
          if (lit) {
            g.fillStyle = r() < 0.85 ? "#ffe2a8" : "#cfe2ff";
            g.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
            continue;
          }
          own(wx - 2, wy - 2, ww + 4, wh + 2, "#2b2f35");
          hp(wx - 2, wy - 2, ww + 4, wh + 2, 175, 0, 255);
          const grd = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
          grd.addColorStop(0, "#7d93a8");
          grd.addColorStop(0.6, "#3a4756");
          grd.addColorStop(1, "#58697c");
          g.fillStyle = grd;
          g.fillRect(wx, wy, ww, wh);
          hp(wx, wy, ww, wh, 125, 255);
          if (x % 2) own(wx + ww - 18, wy + 4, 14, wh - 4, "#22262b"), hp(wx + ww - 18, wy + 4, 14, wh - 4, 118, 255);
          continue;
        }
        if (kind === "metal") {
          // A strip of high windows, every other floor.
          if (y % 2) continue;
          const wx = bx + 6, wy = by + 10, ww = B - 12, wh = 12;
          if (lit) (g.fillStyle = r() < 0.5 ? "#dfe8ff" : "#000"), g.fillRect(wx, wy, ww, wh);
          else own(wx, wy, ww, wh, "#4a5868"), hp(wx, wy, ww, wh, 150, 255);
          continue;
        }
        const wx = bx + 15, wy = by + 13, ww = 34, wh = 38;
        if (lit) {
          const on = r() < 0.42;
          g.fillStyle = on ? (r() < 0.6 ? "#ffcf8a" : r() < 0.5 ? "#fff1d0" : "#cfe2ff") : "#000";
          g.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
          continue;
        }
        // Frame (white on brick and plaster, dark aluminium on stone and concrete), glass, a sill.
        const dark = kind === "stone" || kind === "concrete";
        own(wx - 3, wy - 3, ww + 6, wh + 6, dark ? "#5c636b" : "#e4e0d8");
        hp(wx - 5, wy - 5, ww + 10, wh + 10, 160); // the reveal: the opening is set into the wall
        hp(wx - 3, wy - 3, ww + 6, wh + 6, 150, 0, 255);
        const grd = g.createLinearGradient(wx, wy, wx + ww, wy + wh);
        grd.addColorStop(0, "#5e7186");
        grd.addColorStop(0.55, "#2f3b48");
        grd.addColorStop(1, "#46566a");
        g.fillStyle = grd;
        g.fillRect(wx, wy, ww, wh);
        hp(wx, wy, ww, wh, 105, 255);
        if (r() < 0.3) own(wx, wy, ww, wh * (0.25 + r() * 0.5), "rgba(225,214,190,.95)");
        own(wx + ww / 2 - 1, wy, 2, wh, dark ? "#4a5058" : "#cfcac0");
        hp(wx + ww / 2 - 1, wy, 2, wh, 135, 0, 255);
        own(wx - 5, wy + wh + 2, ww + 10, 4, kind === "brick" ? "#d8d2c6" : "#bdb8ae");
        hp(wx - 5, wy + wh + 2, ww + 10, 4, 240);
      }
    const rgb = g.getImageData(0, 0, S, S).data, a = m.getImageData(0, 0, S, S).data;
    const off = layer * S * S * 4;
    for (let i = 0; i < S * S; i++) {
      data[off + i * 4] = rgb[i * 4];
      data[off + i * 4 + 1] = rgb[i * 4 + 1];
      data[off + i * 4 + 2] = rgb[i * 4 + 2];
      data[off + i * 4 + 3] = lit ? 255 : 255 - a[i * 4];
    }
    if (surf) {
      const rel = relief.getImageData(0, 0, S, S).data;
      const h = new Float32Array(S * S);
      for (let i = 0; i < S * S; i++) h[i] = rel[i * 4] / 255;
      const n = heightToNormal(h, S, 9);
      const wallRough = { plaster: 0.9, brick: 0.86, stone: 0.5, concrete: 0.92, metal: 0.4, shopfront: 0.85 }[kind];
      const wallMetal = kind === "metal" ? 0.55 : 0;
      for (let i = 0; i < S * S; i++) {
        const glass = rel[i * 4 + 1] > 127, frame = rel[i * 4 + 2] > 127;
        const o = off + i * 4;
        surf[o] = Math.round((n[i * 2] * 0.5 + 0.5) * 255);
        surf[o + 1] = Math.round((n[i * 2 + 1] * 0.5 + 0.5) * 255);
        surf[o + 2] = Math.round((glass ? 0.04 : frame ? 0.42 : wallRough) * 255);
        surf[o + 3] = Math.round((glass ? 0 : frame ? (kind === "stone" || kind === "concrete" || kind === "shopfront" || kind === "metal" ? 0.7 : 0.05) : wallMetal) * 255);
      }
    }
  });
  const t = new THREE.DataArrayTexture(data, S, S, FACADES.length);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  if (!surf) return { tex: t, surf: null };
  const st = new THREE.DataArrayTexture(surf, S, S, FACADES.length);
  st.wrapS = st.wrapT = THREE.RepeatWrapping;
  st.colorSpace = THREE.NoColorSpace;
  st.minFilter = THREE.LinearMipmapLinearFilter;
  st.magFilter = THREE.LinearFilter;
  st.generateMipmaps = true;
  st.anisotropy = 4;
  st.needsUpdate = true;
  return { tex: t, surf: st };
}

// ---------------------------------------------------------------- shared uniforms
/** Uniforms every city material shares: the clock (wind), how wet the streets are, the wind's strength. */
export const WORLD = { time: { value: 0 }, wet: { value: 0 }, wind: { value: 1 } };

/** What the quality tier allows the materials (graphics/quality.ts Profile). */
export type MaterialOpts = { surfaces: boolean; wind: boolean; lampPools: boolean; anisotropy: number };
const PLAIN: MaterialOpts = { surfaces: false, wind: false, lampPools: false, anisotropy: 4 };

/**
 * The real walls read their façade from `facadeLayers` by each vertex's `fac` (geometry
 * without it is plaster, layer 0). `map` and `emissiveMap` stay set so three.js keeps the
 * bay UVs and their repeat; the arrays replace what is sampled. With `noise` (the surfaces
 * tier) the façade also gets its relief, glass that reflects the sky, metal frames, grime
 * toward the pavement, large soft weathering, and darkens when it rains.
 */
function wearFacades(mat: THREE.MeshStandardMaterial, noise: THREE.Texture | null) {
  const base = facadeLayers(false), lit = facadeLayers(true);
  mat.userData.textures = [base.tex, lit.tex, ...(base.surf ? [base.surf] : [])];
  const surf = noise ? base.surf : null;
  if (surf) {
    mat.normalMap = mat.map; // only so three.js builds the tangent frame; the array is sampled
    mat.roughness = 1;
    mat.metalness = 1;
  }
  return patchShader(mat, surf ? "facade-surf-1" : "facade-layers-1", (sh) => {
    sh.uniforms.facadeMap = { value: base.tex };
    sh.uniforms.facadeLit = { value: lit.tex };
    sh.vertexShader = after(sh.vertexShader, "common", "attribute float fac;\nvarying float vFac;\nvarying vec3 vSqW;");
    sh.vertexShader = after(sh.vertexShader, "uv_vertex", "vFac = fac;");
    sh.vertexShader = after(sh.vertexShader, "project_vertex", "vSqW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    let f = after(sh.fragmentShader, "common", "uniform highp sampler2DArray facadeMap;\nuniform highp sampler2DArray facadeLit;\nvarying float vFac;\nvarying vec3 vSqW;\nvec4 facadeTexel;");
    f = swap(f, "map_fragment", "float sqLayer = floor(vFac + 0.5);\nfacadeTexel = texture(facadeMap, vec3(vMapUv, sqLayer));\ndiffuseColor.rgb *= facadeTexel.rgb;" + (surf ? "\nvec4 facadeS = texture(facadeSurf, vec3(vMapUv, sqLayer));" : ""));
    f = swap(f, "color_fragment", "diffuseColor.rgb *= mix(vec3(1.0), vColor, facadeTexel.a);");
    f = swap(f, "emissivemap_fragment", "totalEmissiveRadiance *= texture(facadeLit, vec3(vEmissiveMapUv, floor(vFac + 0.5))).rgb;");
    if (surf) {
      sh.uniforms.facadeSurf = { value: surf };
      sh.uniforms.sqNoise = { value: noise };
      sh.uniforms.sqWet = WORLD.wet;
      f = after(f, "common", "uniform highp sampler2DArray facadeSurf;\nuniform sampler2D sqNoise;\nuniform float sqWet;");
      f = f.replace(
        "diffuseColor.rgb *= mix(vec3(1.0), vColor, facadeTexel.a);",
        `diffuseColor.rgb *= mix(vec3(1.0), vColor, facadeTexel.a);
float sqWall = facadeTexel.a;
float sqN = texture2D(sqNoise, vSqW.xz * 0.011 + vec2(vSqW.y * 0.006, 0.0)).r;
float sqGrime = (1.0 - smoothstep(0.2, 2.8, vSqW.y)) * 0.24 + max(sqN - 0.45, 0.0) * 0.34;
diffuseColor.rgb *= 1.0 - sqWall * (sqGrime + 0.2 * sqWet);`,
      );
      f = swap(f, "roughnessmap_fragment", "float roughnessFactor = mix(facadeS.b, 0.35, sqWet * sqWall * 0.6);");
      f = swap(f, "metalnessmap_fragment", "float metalnessFactor = facadeS.a;");
      f = swap(f, "normal_fragment_maps", "vec3 mapN = vec3(facadeS.xy * 2.0 - 1.0, 0.0);\nmapN.z = sqrt(max(1e-4, 1.0 - dot(mapN.xy, mapN.xy)));\nnormal = normalize(tbn * mapN);");
    }
    sh.fragmentShader = f;
  });
}

/**
 * Leaves within a few metres of the camera aren't drawn (thinning out over the next metre),
 * so a chase camera down a street lined with trees never looks out from inside one.
 */
function clearNearCamera<T extends THREE.Material>(mat: T, r = 3.2) {
  return patchShader(mat, `clear-near-camera-${r}`, (sh) => {
    sh.vertexShader = after(sh.vertexShader, "common", "varying vec3 vNearW;");
    sh.vertexShader = after(sh.vertexShader, "project_vertex", "vec4 nearW = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nnearW = instanceMatrix * nearW;\n#endif\nvNearW = (modelMatrix * nearW).xyz;");
    sh.fragmentShader = after(sh.fragmentShader, "common", "varying vec3 vNearW;");
    sh.fragmentShader = after(sh.fragmentShader, "void main() {", `float nearD = distance(vNearW, cameraPosition) - ${r.toFixed(2)};\nif (nearD < 0.0 || (nearD < 1.0 && fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) > nearD)) discard;`);
  });
}

/** Trees sway, each to its own beat (phase from where it stands), leaves flutter; stronger in the rain. */
function windy<T extends THREE.Material>(mat: T) {
  return patchShader(mat, "wind", (sh) => {
    sh.uniforms.sqTime = WORLD.time;
    sh.uniforms.sqWind = WORLD.wind;
    sh.vertexShader = after(sh.vertexShader, "common", "uniform float sqTime;\nuniform float sqWind;");
    sh.vertexShader = after(
      sh.vertexShader,
      "begin_vertex",
      `#ifdef USE_INSTANCING
vec2 sqRoot = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
#else
vec2 sqRoot = vec2(0.0);
#endif
float sqH = max(transformed.y - 2.0, 0.0);
float sqPh = dot(sqRoot, vec2(0.37, 0.23));
transformed.x += (sin(sqTime * 1.4 + sqPh) * 0.6 + sin(sqTime * 2.3 + sqPh * 1.7) * 0.4) * 0.035 * sqH * sqWind;
transformed.z += cos(sqTime * 1.1 + sqPh * 0.8) * 0.025 * sqH * sqWind;
transformed += 0.012 * sqH * sqWind * sin(sqTime * 6.0 + transformed.yzx * 3.0 + sqPh);`,
    );
  });
}

/**
 * Large-scale tone variation (so a park or a roof isn't one flat colour) and the rain: wet
 * surfaces darken and turn glossy. `macro`: world-space frequency of the variation (0: none).
 */
function weathered<T extends THREE.MeshStandardMaterial>(mat: T, noise: THREE.Texture | null, o: { macro?: number; darken: number; rough: number; mirror?: number }) {
  const macro = noise && o.macro ? o.macro : 0;
  // Wet, it mirrors the street a little (screen-space reflections).
  if (o.mirror) mirrored(mat, `sqWet * ${o.mirror.toFixed(3)}`);
  return patchShader(mat, `weather-${macro}-${o.darken}-${o.rough}`, (sh) => {
    sh.uniforms.sqWet = WORLD.wet;
    let v = sh.vertexShader, f = sh.fragmentShader;
    f = after(f, "common", "uniform float sqWet;");
    if (macro) {
      sh.uniforms.sqNoise = { value: noise };
      v = after(v, "common", "varying vec3 vSqW;");
      v = after(v, "project_vertex", "vec4 sqW4 = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\nsqW4 = instanceMatrix * sqW4;\n#endif\nvSqW = (modelMatrix * sqW4).xyz;");
      f = after(f, "common", "uniform sampler2D sqNoise;\nvarying vec3 vSqW;");
      f = after(f, "color_fragment", `diffuseColor.rgb *= 0.84 + 0.32 * texture2D(sqNoise, vSqW.xz * ${macro.toFixed(4)}).r;`);
    }
    f = after(f, "color_fragment", `diffuseColor.rgb *= 1.0 - sqWet * ${o.darken.toFixed(3)};`);
    f = after(f, "roughnessmap_fragment", `roughnessFactor = mix(roughnessFactor, ${o.rough.toFixed(3)}, sqWet);`);
    sh.vertexShader = v;
    sh.fragmentShader = f;
  });
}

/**
 * Asphalt and pavements in detail: world-planar asphalt (aggregate, cracks, patches) on the
 * dark surfaces and 50 cm slabs on the light ones (the vertex colour tells them apart),
 * large-scale wear, and in the rain a wet sheen with puddles that mirror the sky.
 */
function streetSurface(mat: THREE.MeshStandardMaterial, s: { asphalt: THREE.Texture; paving: THREE.Texture; noise: THREE.Texture }) {
  return patchShader(mat, "street-surface-1", (sh) => {
    Object.assign(sh.uniforms, { sqAsph: { value: s.asphalt }, sqPave: { value: s.paving }, sqNoise: { value: s.noise }, sqWet: WORLD.wet });
    sh.vertexShader = after(sh.vertexShader, "common", "varying vec3 vSqW;");
    sh.vertexShader = after(sh.vertexShader, "project_vertex", "vSqW = (modelMatrix * vec4(transformed, 1.0)).xyz;");
    let f = after(sh.fragmentShader, "common", "uniform sampler2D sqAsph;\nuniform sampler2D sqPave;\nuniform sampler2D sqNoise;\nuniform float sqWet;\nvarying vec3 vSqW;");
    f = after(
      f,
      "color_fragment",
      `float sqLum = dot(vColor, vec3(0.2126, 0.7152, 0.0722));
float sqPaved = smoothstep(0.16, 0.3, sqLum);
vec4 sqS = mix(texture2D(sqAsph, vSqW.xz * 0.25), texture2D(sqPave, vSqW.xz * 0.5), sqPaved);
vec4 sqN = texture2D(sqNoise, vSqW.xz * 0.019);
diffuseColor.rgb *= sqS.a * 2.0 * (0.86 + 0.28 * sqN.r);
float sqPud = smoothstep(0.62, 0.68, sqN.g + (sqS.a - 0.5) * 0.15) * sqWet * (1.0 - 0.7 * sqPaved);
diffuseColor.rgb *= 1.0 - sqWet * 0.42 - sqPud * 0.15;`,
    );
    f = swap(f, "roughnessmap_fragment", "float roughnessFactor = sqS.b * (0.92 + 0.16 * sqN.b);\nroughnessFactor = mix(roughnessFactor, 0.3, sqWet * 0.8);\nroughnessFactor = mix(roughnessFactor, 0.06, sqPud);");
    f = after(
      f,
      "normal_fragment_maps",
      `vec3 sqUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
vec3 sqTx = normalize((viewMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz), sqTz = normalize((viewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);
vec2 sqD = sqS.xy * 2.0 - 1.0;
vec3 sqP = normalize(sqTx * sqD.x + sqTz * sqD.y + sqUp * sqrt(max(1e-4, 1.0 - dot(sqD, sqD))));
normal = normalize(mix(normal, sqP, smoothstep(0.8, 0.95, dot(normal, sqUp)) * (1.0 - sqPud)));`,
    );
    sh.fragmentShader = f;
  });
}
/** How mirror-like the street is, wet: a sheen everywhere (less on paving slabs), a near mirror in the puddles. */
const STREET_MIRROR = "sqWet * 0.42 * (1.0 - 0.5 * sqPaved) + sqPud * 0.5";

/** A soft round glow for the light under a street lamp at night. */
function poolTexture() {
  const S = 128;
  const { c, g } = canvas(S);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  for (let i = 0; i <= 8; i++) grd.addColorStop(i / 8, `rgba(255,255,255,${Math.pow(1 - i / 8, 1.7).toFixed(3)})`);
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
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
export function makeMaterials(style: Style, opts: MaterialOpts = PLAIN) {
  const off = (f: number) => ({ polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f });
  // The glow under each street lamp at night (both styles); invisible by day.
  const pool = new THREE.MeshBasicMaterial({ map: poolTexture(), color: "#ffc27a", transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, ...off(-4) });
  if (style === "toon") {
    const trees = clearNearCamera(toon({ vertexColors: true }));
    const m = {
      walls: toon({ map: facade("toon", false), vertexColors: true, emissiveMap: facade("toon", true), emissive: new THREE.Color("#ffcf6b"), emissiveIntensity: 0 }),
      glass: toon({ map: facade("toon", false), vertexColors: true }),
      roofs: toon({ vertexColors: true, side: THREE.DoubleSide }),
      roads: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, ...off(-2) }),
      marks: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, ...off(-3) }),
      ground: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, ...off(-1) }),
      water: new THREE.MeshPhongMaterial({ color: "#52b8ef", side: THREE.DoubleSide, shininess: 90, specular: new THREE.Color("#ffffff"), transparent: true, opacity: 0.92, ...off(-1) }),
      trees: opts.wind ? windy(trees) : trees,
      props: toon({ vertexColors: true }),
      glow: new THREE.MeshBasicMaterial({ color: "#fff2c0" }),
      pool,
    };
    return withDispose(m, { pools: opts.lampPools, release: () => {} });
  }
  const s = opts.surfaces ? surfaces(opts.anisotropy) : null;
  const noise = s?.noise ?? null;
  const std = (o: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial(o);
  const trees = weathered(clearNearCamera(std({ vertexColors: true, roughness: 0.92, flatShading: true })), null, { darken: 0.18, rough: 0.55 });
  const m = {
    walls: wearFacades(std({ map: facade("real", false), vertexColors: true, roughness: 0.86, metalness: 0, emissiveMap: facade("real", true), emissive: new THREE.Color("#ffd9a0"), emissiveIntensity: 0 }), noise),
    glass: weathered(std({ map: curtain(false), vertexColors: true, roughness: s ? 0.06 : 0.12, metalness: s ? 0.6 : 0.75, emissiveMap: curtain(true), emissive: new THREE.Color("#ffe6b8"), emissiveIntensity: 0, envMapIntensity: s ? 1.35 : 1.2 }), null, { darken: 0.05, rough: 0.04 }),
    roofs: weathered(std({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), noise, { macro: 0.03, darken: 0.3, rough: 0.4 }),
    roads: s
      ? mirrored(streetSurface(std({ vertexColors: true, roughness: 1, side: THREE.DoubleSide, ...off(-2) }), s), STREET_MIRROR)
      : std({ vertexColors: true, map: grain(0.8, 0.06, 21), roughness: 0.93, side: THREE.DoubleSide, ...off(-2) }),
    marks: weathered(std({ vertexColors: true, roughness: 0.6, side: THREE.DoubleSide, ...off(-3) }), null, { darken: 0.25, rough: 0.22, mirror: 0.22 }),
    ground: weathered(std({ vertexColors: true, map: grain(0.78, 0.02, 33), roughness: 1, side: THREE.DoubleSide, ...off(-1) }), noise, { macro: 0.012, darken: 0.32, rough: 0.6 }),
    water: std({ color: "#2f5f7c", roughness: 0.06, metalness: 0.35, side: THREE.DoubleSide, transparent: true, opacity: 0.94, ...off(-1) }),
    trees: opts.wind ? windy(trees) : trees,
    props: weathered(std({ vertexColors: true, roughness: 0.55, metalness: 0.35 }), null, { darken: 0.15, rough: 0.25 }),
    glow: new THREE.MeshBasicMaterial({ color: "#6b6150" }),
    pool,
  };
  return withDispose(m, { pools: opts.lampPools, release: () => s?.release() });
}

function withDispose<T extends Record<string, THREE.Material>>(m: T, extra: { pools: boolean; release: () => void }) {
  return {
    ...m,
    /** Lamps throw light pools at night. */
    pools: extra.pools,
    dispose() {
      for (const mat of Object.values(m)) {
        const s = mat as THREE.MeshStandardMaterial;
        s.map?.dispose();
        s.emissiveMap?.dispose();
        for (const tex of (s.userData.textures as THREE.Texture[] | undefined) ?? []) tex.dispose();
        mat.dispose();
      }
      extra.release();
    },
  };
}

/** Lit windows, street lamps and the light they throw: 0 by day, 1 at night. */
export function setNight(mats: Materials, style: Style, night: number) {
  mats.walls.emissiveIntensity = night * (style === "real" ? 1.6 : 1.1);
  if ("emissiveIntensity" in mats.glass) mats.glass.emissiveIntensity = night * 0.9;
  // Lamp heads glow brighter than white at night (the HDR pipeline blooms them).
  mats.glow.color.set(night > 0.3 ? "#ffd58a" : style === "real" ? "#6b6150" : "#fff2c0");
  if (night > 0.3) mats.glow.color.multiplyScalar(1 + 3 * night);
  mats.pool.opacity = Math.max(0, Math.min(1, (night - 0.3) / 0.6)) * (style === "real" ? 0.6 : 0.4);
  mats.pool.visible = mats.pool.opacity > 0.001;
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

/** Cloud layer of the realistic sky: soft noise projected on a plane far overhead, lit by the sun, drifting. */
function cloudDome(noise: THREE.Texture) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    uniforms: { tNoise: { value: noise }, uCover: { value: 0.3 }, uTime: { value: 0 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() } },
    vertexShader: "varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform sampler2D tNoise; uniform float uCover; uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb; varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        if (d.y <= 0.0) discard;
        vec2 p = d.xz / (d.y + 0.12) * 0.32 + vec2(uTime * 0.0035, uTime * 0.0012);
        float n = texture2D(tNoise, p * 0.23).r * 0.62 + texture2D(tNoise, p * 0.81 + 0.37).g * 0.28 + texture2D(tNoise, p * 2.9).b * 0.1;
        float c = smoothstep(1.0 - uCover, 1.0 - uCover + 0.3, n);
        float a = c * smoothstep(0.015, 0.2, d.y) * 0.96;
        float toSun = pow(max(dot(d, uSunDir), 0.0), 5.0);
        vec3 col = mix(uAmb, uSunCol, 0.45 + 0.55 * toSun) * (1.0 - 0.38 * c * c);
        gl_FragColor = vec4(col, a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(950, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1.5;
  return { mesh, mat };
}

/** Everything the sky and its light need for one moment: the (blended) light table, where the sun is, how dark and how grey it is. */
export type SkyState = { L: Light; sunDir: THREE.Vector3; night: number; overcast: number; cover: number };

/**
 * The sky dome, its lighting and (real style) the environment map that glass, paint and
 * water reflect. `apply(state)` re-lights everything for the time of day and weather; the
 * environment map is only re-rendered when the sky has visibly changed.
 */
export function makeSkySystem(renderer: THREE.WebGLRenderer, scene: THREE.Scene, style: Style, opts: { noise?: THREE.Texture | null } = {}) {
  const grad = gradientSky();
  displayReferred(grad.mat, true);
  // The sky first, then the clouds, the mountain skyline (renderOrder −1, skyline.ts), then the city.
  grad.mesh.renderOrder = -2;
  scene.add(grad.mesh);
  let atmo: Sky | null = null;
  if (style === "real") {
    atmo = new Sky();
    atmo.scale.setScalar(1800);
    atmo.frustumCulled = false;
    atmo.renderOrder = -2;
    scene.add(atmo);
  }
  const clouds = style === "real" && opts.noise ? cloudDome(opts.noise) : null;
  if (clouds) scene.add(clouds.mesh);
  const pmrem = style === "real" ? new THREE.PMREMGenerator(renderer) : null;
  let env: THREE.WebGLRenderTarget | null = null;
  let envKey = "";
  let cloudsOn = true;

  const apply = ({ L, sunDir, night, overcast, cover }: SkyState) => {
    grad.mat.uniforms.top.value.set(L.top);
    grad.mat.uniforms.horizon.value.set(L.horizon);
    grad.mat.uniforms.sunCol.value.set(L.sun);
    grad.mat.uniforms.sunDir.value.copy(sunDir);
    grad.mat.uniforms.stars.value = Math.max(0, night - 0.6) / 0.4 * (1 - overcast);
    grad.mat.uniforms.sunSize.value = night > 0.6 && style === "real" ? 2400 : 600;
    // The atmosphere until the sun is well below the horizon, then the night gradient with stars.
    const atmoOn = !!atmo && night < 0.85;
    if (atmo) {
      atmo.visible = atmoOn;
      const u = atmo.material.uniforms;
      u.sunPosition.value.copy(sunDir);
      u.turbidity.value = 6 + 10 * overcast;
      u.rayleigh.value = 1.4 - 0.9 * overcast;
      u.mieCoefficient.value = 0.004 + 0.012 * overcast;
      u.mieDirectionalG.value = 0.85 - 0.25 * overcast;
    }
    grad.mesh.visible = !atmoOn;
    if (clouds) {
      const u = clouds.mat.uniforms;
      u.uCover.value = cover;
      u.uSunDir.value.copy(sunDir);
      u.uSunCol.value.set(L.sun).multiplyScalar(night > 0.6 ? 0.25 : 1.7 * (1 - 0.5 * overcast));
      u.uAmb.value.set(L.hemiSky).lerp(new THREE.Color(L.fog), 0.5).multiplyScalar(night > 0.6 ? 0.12 : 0.9);
      clouds.mesh.visible = cloudsOn && cover > 0.01;
    }
    renderer.toneMappingExposure = L.exposure;
    if (pmrem) {
      // Reflections: render the sky alone into a prefiltered environment map — only when it changed enough to see.
      const q = (v: number) => Math.round(v * 20);
      const key = [L.top, L.horizon, L.sun, atmoOn, q(sunDir.x), q(sunDir.y), q(sunDir.z), q(overcast), q(night)].join();
      if (key !== envKey) {
        envKey = key;
        const envScene = new THREE.Scene();
        const sky = atmoOn ? atmo!.clone() : grad.mesh.clone();
        sky.visible = true;
        envScene.add(sky);
        const was = DISPLAY.post.value;
        DISPLAY.post.value = 0; // the environment is light, not a picture
        const next = pmrem.fromScene(envScene, 0, 0.1, 2000);
        DISPLAY.post.value = was;
        env?.dispose();
        env = next;
        scene.environment = env.texture;
      }
      scene.environmentIntensity = (night > 0.6 ? 0.3 : 0.6) * (1 - 0.3 * overcast);
    }
  };

  return {
    apply,
    /** The adaptive controller drops the cloud layer when frames are short. */
    cloudsOn(on: boolean) {
      cloudsOn = on;
      if (clouds && !on) clouds.mesh.visible = false;
    },
    follow(p: THREE.Vector3, time: number) {
      grad.mesh.position.copy(p);
      atmo?.position.copy(p);
      if (clouds) {
        clouds.mesh.position.copy(p);
        clouds.mat.uniforms.uTime.value = time;
      }
    },
    dispose() {
      grad.mat.dispose();
      grad.mesh.geometry.dispose();
      atmo?.material.dispose();
      atmo?.geometry.dispose();
      clouds?.mat.dispose();
      clouds?.mesh.geometry.dispose();
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
  // Where its light lands at night: a flat patch under the head, reaching a little into the street.
  const pool = new THREE.PlaneGeometry(24, 24).rotateX(-Math.PI / 2).translate(0, 0.3, 2.0);
  // Traffic light: a pole and a head facing the road (+z); its three lamps are separate
  // (white, tinted per light by paintSignals) so they can show the phase.
  const signal = mergeGeometries([
    paint(at(new THREE.CylinderGeometry(0.08, 0.1, 3.6, 6), 0, 1.8, 0), "#3a3d42"),
    paint(at(new THREE.BoxGeometry(0.36, 1.05, 0.3), 0, 3.95, 0), "#25272b"),
  ])!;
  const signalLamps = [4.28, 3.95, 3.62].map((y) => paint(at(new THREE.BoxGeometry(0.2, 0.2, 0.05), 0, y, 0.17), "#ffffff"));
  // Bus shelter: open toward the road (−z), back panel and roof.
  const bus = mergeGeometries([
    paint(at(new THREE.BoxGeometry(3.2, 0.1, 1.5), 0, 2.45, 0), real ? "#5d636b" : "#ff7a59"),
    paint(at(new THREE.BoxGeometry(3.2, 2.2, 0.06), 0, 1.3, 0.7), real ? "#9fb6c4" : "#bfe8ff"),
    paint(at(new THREE.BoxGeometry(0.08, 2.4, 0.08), -1.55, 1.2, -0.65), metal),
    paint(at(new THREE.BoxGeometry(0.08, 2.4, 0.08), 1.55, 1.2, -0.65), metal),
    paint(at(new THREE.BoxGeometry(2.2, 0.08, 0.45), 0, 0.5, 0.4), "#7a5a3a"),
    paint(at(new THREE.BoxGeometry(0.5, 0.5, 0.06), 1.1, 2.75, -0.7), "#2e7dd1"),
  ])!;
  // Park bench, seat facing the road (+z).
  const wood = real ? "#8a6a48" : "#c98a52";
  const bench = mergeGeometries([
    paint(at(new THREE.BoxGeometry(1.7, 0.06, 0.42), 0, 0.45, 0), wood),
    paint(at(new THREE.BoxGeometry(1.7, 0.36, 0.05), 0, 0.72, -0.2), wood),
    paint(at(new THREE.BoxGeometry(0.06, 0.45, 0.4), -0.75, 0.22, 0), metal),
    paint(at(new THREE.BoxGeometry(0.06, 0.45, 0.4), 0.75, 0.22, 0), metal),
  ])!;
  const bin = mergeGeometries([
    paint(at(new THREE.CylinderGeometry(0.24, 0.2, 0.75, 8), 0, 0.42, 0), real ? "#3f6b4a" : "#42b883"),
    paint(at(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 6), 0, 0.04, 0), metal),
  ])!;
  const hydrant = mergeGeometries([
    paint(at(new THREE.CylinderGeometry(0.13, 0.15, 0.62, 8), 0, 0.31, 0), "#d33a2c"),
    paint(at(new THREE.SphereGeometry(0.13, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.62, 0), "#d33a2c"),
    paint(at(new THREE.CylinderGeometry(0.05, 0.05, 0.36, 6).rotateZ(Math.PI / 2), 0, 0.42, 0), "#b8b8b0"),
  ])!;
  // Drinking fountain: a steel water-cooler cabinet with a bowl on top, as on Tehran pavements.
  const fountain = mergeGeometries([
    paint(at(new THREE.BoxGeometry(0.55, 1.0, 0.45), 0, 0.5, 0), real ? "#b9bec4" : "#7fc8ff"),
    paint(at(new THREE.CylinderGeometry(0.2, 0.14, 0.12, 10), 0, 1.06, 0.05), "#d9dde1"),
  ])!;
  // Charity box (صندوق صدقات) on its post: blue, a yellow top, the slot facing the road (+z).
  const charity = mergeGeometries([
    paint(at(new THREE.CylinderGeometry(0.05, 0.05, 0.78, 6), 0, 0.39, 0), metal),
    paint(at(new THREE.BoxGeometry(0.36, 0.5, 0.3), 0, 1.02, 0), real ? "#1e5fb4" : "#3d8bff"),
    paint(at(new THREE.BoxGeometry(0.39, 0.13, 0.33), 0, 1.33, 0), real ? "#f2c230" : "#ffd166"),
    paint(at(new THREE.BoxGeometry(0.16, 0.025, 0.04), 0, 1.2, 0.15), "#141414"),
  ])!;
  // Newspaper kiosk (دکه): a green booth, its window and counter of magazines and snacks to the road (+z).
  const kiosk = mergeGeometries([
    paint(at(new THREE.BoxGeometry(1.8, 2.2, 1.3), 0, 1.1, 0), real ? "#2f6b4f" : "#4cc38a"),
    paint(at(new THREE.BoxGeometry(2.1, 0.12, 1.7), 0, 2.27, 0.12), real ? "#e9e6dc" : "#ffffff"),
    paint(at(new THREE.BoxGeometry(1.5, 0.9, 0.05), 0, 1.5, 0.66), real ? "#9fb6c4" : "#cfefff"),
    paint(at(new THREE.BoxGeometry(1.6, 0.06, 0.36), 0, 0.98, 0.82), "#c9a46a"),
    paint(at(new THREE.BoxGeometry(1.4, 0.12, 0.26), 0, 1.07, 0.82), "#ff6a13"),
    ...[-0.5, 0, 0.5].map((x, i) => paint(at(new THREE.BoxGeometry(0.3, 0.4, 0.03), x, 1.45, 0.7), ["#e8384f", "#f2c230", "#1f6feb"][i])),
  ])!;
  // The municipality's waste container: a green bin on wheels with a hinged lid, front (+z) to the road.
  const dumpster = mergeGeometries([
    paint(at(new THREE.BoxGeometry(1.75, 1.05, 1.1), 0, 0.68, 0), real ? "#2f6b3f" : "#3fbf6a"),
    paint(at(new THREE.BoxGeometry(1.85, 0.1, 1.2), 0, 1.25, -0.02), real ? "#26583a" : "#2f9e55"),
    ...[-0.7, 0.7].flatMap((x) => [-0.42, 0.42].map((z) => paint(at(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 8).rotateZ(Math.PI / 2), x, 0.1, z), "#1b1b1b"))),
  ])!;
  const tpl = {
    tree, lamp, lampHead, pool, signal, signalRed: signalLamps[0], signalAmber: signalLamps[1], signalGreen: signalLamps[2], bus, bench, bin, hydrant, fountain, charity, kiosk, dumpster,
    /** Other kinds of tree from real models (adoptModels): a street's trees are spread over all of them. */
    variants: [] as THREE.BufferGeometry[],
    /** Real models are in (tree tints soften: the models bring their own colours). */
    modelled: false,
    dispose() {
      for (const v of Object.values(tpl)) if ((v as THREE.BufferGeometry)?.isBufferGeometry) (v as THREE.BufferGeometry).dispose();
      for (const g of tpl.variants) g.dispose();
    },
  };
  return tpl;
}

/** The kinds a real model can stand in for (scripts/props.ts builds them). */
const MODELLED = ["tree", "lamp", "bus", "bench", "bin", "hydrant", "dumpster"] as const;

/**
 * Real street furniture (drive/propModels.ts) in place of the drawn templates. Returns the
 * drawn geometries it replaced, for the caller to swap on tiles already built (their
 * instanced meshes carry `userData.prop`) and then dispose.
 */
export function adoptModels(tpl: Templates, models: Partial<Record<string, THREE.BufferGeometry>>, lampTop: [number, number, number] | null) {
  const old: THREE.BufferGeometry[] = [];
  for (const k of MODELLED) {
    const g = models[k];
    if (!g) continue;
    old.push(tpl[k]);
    tpl[k] = g;
  }
  // The lamp's glow and its pool of light go where the model's head is.
  if (models.lamp && lampTop) {
    const [x, y, z] = lampTop;
    old.push(tpl.lampHead, tpl.pool);
    tpl.lampHead = paint(at(new THREE.BoxGeometry(0.3, 0.04, 0.46), x, y - 0.12, z), "#ffffff");
    tpl.pool = new THREE.PlaneGeometry(24, 24).rotateX(-Math.PI / 2).translate(x, 0.3, z + 0.4);
  }
  tpl.variants = [models.tree2, models.pine].filter((g): g is THREE.BufferGeometry => !!g);
  tpl.modelled = true;
  return old;
}


/**
 * A tile's trees spread over the kinds of tree (treeVariant), each tree's tint softened
 * toward white: a real model brings its own greens, the tint only varies them a little.
 */
function treeGroups(p: { mats: Float32Array; cols: Float32Array | null }, variants: number) {
  const groups = Array.from({ length: variants + 1 }, () => ({ m: [] as number[], c: [] as number[] }));
  for (let i = 0; i < p.mats.length / 16; i++) {
    const g = groups[treeVariant(p.mats[i * 16 + 12], p.mats[i * 16 + 14], variants)];
    for (let k = 0; k < 16; k++) g.m.push(p.mats[i * 16 + k]);
    for (let k = 0; k < 3; k++) g.c.push(p.cols ? 0.78 + 0.22 * p.cols[i * 3 + k] : 1);
  }
  return groups.map((g) => ({ mats: new Float32Array(g.m), cols: new Float32Array(g.c) }));
}

// ---------------------------------------------------------------- a tile's meshes
export type TileMeshes = {
  group: THREE.Group;
  /** Street furniture: hidden when the tile is far away. */
  detail: THREE.Group;
  footprints: Footprint[];
  obstacles: Footprint[];
  roads: Float32Array[];
  roadWidths: number[];
  roadKinds: TileArrays["roadKinds"];
  roadNames: (string | null)[];
  roadDrawn: boolean[];
  labels: Label[];
  /** Where the traffic lights stand, and whether their street runs north–south (cars in traffic.ts stop at them). */
  signals: { x: number; z: number; ns: boolean }[];
  /** Where the street lamps stand (x, z pairs): at night the nearest ones get real lights (nightLights.ts). */
  streetLamps: Float32Array;
  /** The lights' red, amber and green lamps (paintSignals colours them). */
  lamps: THREE.InstancedMesh[];
  real: boolean;
  dispose: () => void;
};

const SIGNAL_MAT = new THREE.MeshBasicMaterial({ color: "#ffffff" });
const LIT = [new THREE.Color("#ff3b30"), new THREE.Color("#ffb020"), new THREE.Color("#34d058")];
const DIM = LIT.map((c) => c.clone().multiplyScalar(0.18));

/** Show each traffic light's phase (lib/traffic.ts signalPhase) on its lamps. */
export function paintSignals(m: TileMeshes, phase: (ns: boolean) => number) {
  if (!m.lamps.length) return;
  const ph = m.signals.map((s) => phase(s.ns));
  m.lamps.forEach((mesh, li) => {
    const lamp = li % 3; // red, amber, green
    const cols = mesh.instanceColor!;
    for (let i = 0; i < ph.length; i++) (lamp === 2 - ph[i] ? LIT[lamp] : DIM[lamp]).toArray(cols.array, i * 3);
    cols.needsUpdate = true;
  });
}

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
    if (l.fac) g.setAttribute("fac", new THREE.BufferAttribute(l.fac, 1));
    g.setIndex(new THREE.BufferAttribute(l.idx, 1));
    g.computeBoundingSphere();
    geoms.push(g);
    // Balconies and rooftop kit are drawn like roofs, kerbs and pavements like the street,
    // and only up close (with the other detail).
    const trim = l.name === "trim" || l.name === "kerbs";
    const mesh = new THREE.Mesh(g, l.name === "trim" ? mats.roofs : l.name === "kerbs" ? mats.roads : mats[l.name]);
    const solid = l.name === "walls" || l.name === "glass" || l.name === "roofs";
    mesh.castShadow = opts.shadows && solid;
    mesh.receiveShadow = opts.shadows && l.name !== "water";
    mesh.matrixAutoUpdate = false;
    (trim ? detail : group).add(mesh);
  }
  const insts: THREE.InstancedMesh[] = [];
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, p: { mats: Float32Array; cols: Float32Array | null }, shadow: boolean, prop?: string) => {
    const n = p.mats.length / 16;
    const m = new THREE.InstancedMesh(geo, mat, n);
    // Which template it draws, so real models can take over on tiles already built.
    if (prop) m.userData.prop = prop;
    m.instanceMatrix = new THREE.InstancedBufferAttribute(p.mats, 16);
    if (p.cols) m.instanceColor = new THREE.InstancedBufferAttribute(p.cols, 3);
    m.castShadow = shadow && opts.shadows;
    m.computeBoundingSphere();
    m.matrixAutoUpdate = false;
    detail.add(m);
    insts.push(m);
  };
  const byKind: Record<PropKind, THREE.BufferGeometry> = { tree: tpl.tree, lamp: tpl.lamp, signal: tpl.signal, bus: tpl.bus, bench: tpl.bench, bin: tpl.bin, hydrant: tpl.hydrant, fountain: tpl.fountain, charity: tpl.charity, kiosk: tpl.kiosk, dumpster: tpl.dumpster };
  for (const p of a.props) {
    if (p.kind === "tree" && tpl.modelled) {
      treeGroups(p, tpl.variants.length).forEach((g, vi) => g.mats.length && inst(vi ? tpl.variants[vi - 1] : tpl.tree, mats.trees, g, true, vi ? undefined : "tree"));
      continue;
    }
    inst(byKind[p.kind], p.kind === "tree" ? mats.trees : mats.props, p, p.kind === "tree", p.kind);
    if (p.kind === "lamp") inst(tpl.lampHead, mats.glow, { mats: p.mats, cols: null }, false, "lampHead");
    if (p.kind === "lamp" && mats.pools) inst(tpl.pool, mats.pool, { mats: p.mats, cols: null }, false, "pool");
  }
  const lamps: THREE.InstancedMesh[] = [];
  for (const p of a.props)
    if (p.kind === "signal") for (const g of [tpl.signalRed, tpl.signalAmber, tpl.signalGreen]) (inst(g, SIGNAL_MAT, { mats: p.mats, cols: new Float32Array((p.mats.length / 16) * 3) }, false), lamps.push(insts[insts.length - 1]));
  // A light faces across its street (+z of the head): facing east or west means the street runs north–south.
  const signals: { x: number; z: number; ns: boolean }[] = [];
  for (const p of a.props) if (p.kind === "signal") for (let i = 0; i < p.mats.length; i += 16) signals.push({ x: p.mats[i + 12], z: p.mats[i + 14], ns: Math.abs(p.mats[i + 8]) > Math.abs(p.mats[i + 10]) });
  const streetLamps: number[] = [];
  for (const p of a.props) if (p.kind === "lamp") for (let i = 0; i < p.mats.length; i += 16) streetLamps.push(p.mats[i + 12], p.mats[i + 14]);
  return {
    group,
    detail,
    streetLamps: new Float32Array(streetLamps),
    signals,
    lamps,
    footprints: a.footprints,
    obstacles: a.obstacles,
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
export function drawIcon(g: CanvasRenderingContext2D, emoji: string, x: number, y: number, size: number, done: () => void) {
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
  const flat = oneLine(text);
  const label = flat.length > 28 ? `${flat.slice(0, 27)}…` : flat;
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
  const [main, second] = nameLines(text);
  // One line 64 px tall; a second name goes underneath, smaller.
  const L1 = 64, L2 = second ? 42 : 0, H = L1 + L2;
  const font1 = `700 ${Math.round(L1 * 0.62)}px ${TEXT_FONT}`, font2 = `600 ${Math.round(L2 * 0.62)}px ${TEXT_FONT}`;
  const probe = canvas(4).g;
  probe.font = font1;
  let tw = probe.measureText(main).width;
  if (second) (probe.font = font2), (tw = Math.max(tw, probe.measureText(second).width));
  const w = Math.min(1024, Math.ceil(tw + 24));
  const { c, g } = canvas(w, H);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.lineWidth = 6;
  g.strokeStyle = style === "real" ? "rgba(0,0,0,.55)" : "rgba(40,40,80,.6)";
  g.fillStyle = style === "real" ? "rgba(255,255,255,.92)" : "#ffffff";
  const line = (tx: string, font: string, y: number) => {
    g.font = font;
    g.direction = /[؀-ۿ]/.test(tx) ? "rtl" : "ltr";
    g.strokeText(tx, w / 2, y, w - 8);
    g.fillText(tx, w / 2, y, w - 8);
  };
  line(main, font1, L1 / 2 + 2);
  if (second) line(second, font2, L1 + L2 / 2 - 2);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  const mat = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, fog: true });
  const height = Math.min(3.2, Math.max(1.6, roadW * 0.34)) * (H / L1);
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
  const mat = new THREE.MeshBasicMaterial({ color: "#f0c05a", transparent: true, opacity: 0.9 });
  const torus = new THREE.Mesh(geo, mat);
  torus.position.y = 6.2;
  const num = makeSign("🏁", `${n}`, "#f0c05a");
  num.sprite.position.y = 14.6;
  group.add(torus, num.sprite);
  return {
    group,
    set(state: "next" | "later" | "done") {
      mat.color.set(state === "next" ? "#f0c05a" : state === "done" ? "#5bd38c" : "#9aa3b5");
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
  const rtl = /[\u0590-\u08ff]/.test(nameLines(text)[0]);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  // Icon on the reading side's start, name filling the rest (shrunk to fit).
  const iconX = rtl ? cw - ch * 0.55 : ch * 0.55;
  drawIcon(g, tr.emoji, iconX, ch / 2, ch * 0.62, () => (t.needsUpdate = true));
  // The name fills the rest (shrunk to fit); a second name runs underneath, smaller.
  const [main, second] = nameLines(text);
  const room = cw - ch * 1.25, mid = rtl ? (cw - ch * 1.05) / 2 : ch * 1.05 + (cw - ch * 1.05) / 2;
  const fit = (tx: string, start: number, min: number) => {
    let size = start;
    g.font = `800 ${size}px ${SIGN_FONT}`;
    while (g.measureText(tx).width > room && size > min) g.font = `800 ${(size -= 2)}px ${SIGN_FONT}`;
  };
  g.fillStyle = tr.fg;
  g.textBaseline = "middle";
  g.textAlign = "center";
  g.shadowColor = "rgba(0,0,0,.35)";
  g.shadowBlur = 4;
  g.direction = /[\u0590-\u08ff]/.test(main) ? "rtl" : "ltr";
  fit(main, second ? ch * 0.4 : ch * 0.5, ch * 0.22);
  g.fillText(main, mid, second ? ch * 0.36 : ch / 2 + 2, room);
  if (second) {
    g.direction = /[\u0590-\u08ff]/.test(second) ? "rtl" : "ltr";
    fit(second, ch * 0.26, ch * 0.16);
    g.fillText(second, mid, ch * 0.74, room);
  }
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

let poleGeo: THREE.CylinderGeometry | null = null, poleMat: THREE.MeshStandardMaterial | null = null, plateGeo: THREE.PlaneGeometry | null = null;

/**
 * A street-name sign on its pole at a corner: one plate per street (both faces read the
 * same), blue enamel in the real city, green in the storybook one, each plate turned
 * along its street. `angle`s are world yaws; the group itself stays unrotated.
 */
export function makeCornerSign(plates: { text: string; angle: number }[], style: Style): Board & { plates: THREE.Mesh[] } {
  poleGeo ??= (() => {
    const g = new THREE.CylinderGeometry(0.06, 0.07, 4.2, 8);
    g.translate(0, -2.1, 0);
    return g;
  })();
  poleMat ??= new THREE.MeshStandardMaterial({ color: "#5b6168", roughness: 0.5, metalness: 0.6 });
  plateGeo ??= new THREE.PlaneGeometry(1, 1);
  const group = new THREE.Group();
  group.add(new THREE.Mesh(poleGeo, poleMat));
  const bg = style === "real" ? "#1d4f91" : "#2f9e5b";
  const owned: { dispose: () => void }[] = [];
  const meshes: THREE.Mesh[] = [];
  let top = 0;
  for (const p of plates) {
    const [main, second] = nameLines(p.text);
    const ch = second ? 112 : 72;
    const probe = canvas(4).g;
    probe.font = `800 44px ${SIGN_FONT}`;
    let tw = probe.measureText(main).width;
    if (second) (probe.font = `600 28px ${SIGN_FONT}`), (tw = Math.max(tw, probe.measureText(second).width));
    const cw = Math.min(768, Math.max(200, Math.ceil(tw + 40)));
    const { c, g } = canvas(cw, ch);
    g.fillStyle = bg;
    g.beginPath();
    if (g.roundRect) g.roundRect(2, 2, cw - 4, ch - 4, 10);
    else g.rect(2, 2, cw - 4, ch - 4);
    g.fill();
    g.strokeStyle = "#ffffff";
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = "#ffffff";
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.font = `800 44px ${SIGN_FONT}`;
    g.direction = /[\u0590-\u08ff]/.test(main) ? "rtl" : "ltr";
    g.fillText(main, cw / 2, second ? 40 : ch / 2 + 2, cw - 24);
    if (second) {
      g.font = `600 28px ${SIGN_FONT}`;
      g.direction = /[\u0590-\u08ff]/.test(second) ? "rtl" : "ltr";
      g.fillText(second, cw / 2, 84, cw - 24);
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: t });
    // Pixels → metres: 72 px of plate is 0.55 m (real ones are ~0.25 m; game-sized to read at speed).
    const H = (ch / 72) * 0.55, W = (cw / ch) * H;
    const mesh = new THREE.Mesh(plateGeo, mat);
    mesh.scale.set(W, H, 1);
    mesh.position.y = top - H / 2;
    mesh.rotation.y = p.angle;
    // A second face turned around, so the name reads right from behind too (not mirrored).
    const back = new THREE.Mesh(plateGeo, mat);
    back.scale.set(W, H, 1);
    back.position.copy(mesh.position);
    back.rotation.y = p.angle + Math.PI;
    group.add(mesh, back);
    meshes.push(mesh, back);
    top -= H + 0.06;
    owned.push(t, mat);
  }
  return { group, mat: meshes[0]?.material as THREE.MeshBasicMaterial, plates: meshes, dispose: () => owned.forEach((o) => o.dispose()) };
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
