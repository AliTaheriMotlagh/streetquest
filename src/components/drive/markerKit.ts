"use client";
// The 3D city's markers and pickups, in the HUD's icon language: ONE canvas icon atlas (the same
// line icons as icons.tsx, lib/iconPaths.ts), ground-projected pulsing rings, a soft light
// pillar that fades with distance and thins when you're close, and pickups that bob and turn
// with a rarity rim and a burst when taken. Materials and geometry are shared; tick() is
// allocation-free and takes the player's distance (lib/hudMarkers.ts has the rules).
import * as THREE from "three";
import { ICON_PATHS, type IconName } from "@/lib/iconPaths";
import { markerFade, markerScale, RARITY_COLORS, type Rarity } from "@/lib/hudMarkers";
import { makeSign } from "./world3d";

// ---------------------------------------------------------------- the atlas
const CELL = 128, COLS = 16; // 2048 x 2048 = 256 cells
let atlasCanvas: HTMLCanvasElement | null = null;
let atlasTex: THREE.CanvasTexture | null = null;
let nextCell = 0;
const cells = new Map<string, THREE.Texture>();
const pathCache = new Map<IconName, Path2D>();

function atlas() {
  if (!atlasTex) {
    atlasCanvas = document.createElement("canvas");
    atlasCanvas.width = atlasCanvas.height = CELL * COLS;
    atlasTex = new THREE.CanvasTexture(atlasCanvas);
    atlasTex.colorSpace = THREE.SRGBColorSpace;
    atlasTex.generateMipmaps = false; // cells would bleed into each other; the cells are drawn at display size
    atlasTex.minFilter = THREE.LinearFilter;
    atlasTex.anisotropy = 4;
  }
  return { c: atlasCanvas!, tex: atlasTex };
}

/** One badge in the atlas: a dark disc, a 5 px ring in `color`, the icon in white. Cached per icon + colour. */
export function badgeTexture(icon: IconName, color: string): THREE.Texture {
  const key = `${icon}|${color}`;
  const have = cells.get(key);
  if (have) return have;
  const { c, tex } = atlas();
  const slot = nextCell++ % (COLS * COLS);
  const cx = (slot % COLS) * CELL, cy = Math.floor(slot / COLS) * CELL;
  const g = c.getContext("2d")!;
  g.save();
  g.clearRect(cx, cy, CELL, CELL);
  g.beginPath();
  g.rect(cx, cy, CELL, CELL);
  g.clip();
  g.translate(cx + CELL / 2, cy + CELL / 2);
  g.fillStyle = "rgba(14,17,24,.94)";
  g.beginPath();
  g.arc(0, 0, CELL / 2 - 4, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = color;
  g.stroke();
  let path = pathCache.get(icon);
  if (!path) pathCache.set(icon, (path = new Path2D(ICON_PATHS[icon])));
  const k = (CELL * 0.5) / 24; // the glyph fills half the badge
  g.scale(k, k);
  g.translate(-12, -12);
  g.lineWidth = 1.75 * 1.25; // a touch heavier than the HUD's, it is seen from afar
  g.lineCap = g.lineJoin = "round";
  g.strokeStyle = "#fff";
  g.stroke(path);
  g.restore();
  // A clone shares the one canvas upload; only its sub-rectangle differs.
  const t = tex.clone();
  t.repeat.set(1 / COLS, 1 / COLS);
  t.offset.set((cx + 0.5) / (CELL * COLS), 1 - (cy + CELL - 0.5) / (CELL * COLS));
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearFilter;
  cells.set(key, t);
  // A new cell changes the shared canvas: every clone must upload again (the source shares one GPU copy).
  for (const o of cells.values()) o.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------- shared geometry
let pillarGeo: THREE.CylinderGeometry | null = null;
let ringGeo: THREE.RingGeometry | null = null;
let tokenGeo: THREE.CylinderGeometry | null = null;
const pillar = () =>
  (pillarGeo ??= (() => {
    const g = new THREE.CylinderGeometry(1, 1, 80, 16, 1, true);
    g.translate(0, 40, 0);
    return g;
  })());
/** A thin ring of radius 1 (scaled per use). */
const ring = () => (ringGeo ??= new THREE.RingGeometry(0.93, 1, 56));
const token = () =>
  (tokenGeo ??= (() => {
    const g = new THREE.CylinderGeometry(1, 1, 0.2, 6);
    g.rotateX(Math.PI / 2); // the faces point along z, so turning on y shows them
    return g;
  })());

const PILLAR_VS = "varying float vY; void main(){ vY = position.y / 80.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }";
// Soft: strongest at the ground, gone by the top, a slow shimmer; `fade` carries the distance rule.
const PILLAR_FS = "uniform vec3 color; uniform float time; uniform float fade; varying float vY; void main(){ float a = pow(1.0 - vY, 1.6) * 0.3 * fade * (0.9 + 0.1 * sin(time * 2.0 + vY * 9.0)); gl_FragColor = vec4(color, a); }";

// ---------------------------------------------------------------- beacons
/**
 * Something to go to: a badge over two pulsing ground rings, a name sign and (`tall`) a soft
 * column of light seen across the city. `lite` drops the column and the second ring.
 */
export function makeBeacon(icon: IconName, color: string, label: string, opts: { tall?: boolean; size?: number; lite?: boolean } = {}) {
  const tall = (opts.tall ?? true) && !opts.lite, size = opts.size ?? 1;
  const group = new THREE.Group();
  const col = new THREE.Color(color);
  let pillarMat: THREE.ShaderMaterial | null = null;
  let column: THREE.Mesh | null = null;
  if (tall) {
    pillarMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { color: { value: col }, time: { value: 0 }, fade: { value: 1 } }, vertexShader: PILLAR_VS, fragmentShader: PILLAR_FS });
    column = new THREE.Mesh(pillar(), pillarMat);
    group.add(column);
  }
  const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide });
  const r1 = new THREE.Mesh(ring(), ringMat);
  r1.rotation.x = -Math.PI / 2;
  r1.position.y = 0.2;
  group.add(r1);
  let r2: THREE.Mesh | null = null;
  if (!opts.lite) {
    r2 = new THREE.Mesh(ring(), ringMat);
    r2.rotation.x = -Math.PI / 2;
    r2.position.y = 0.2;
    group.add(r2);
  }
  const spriteMat = new THREE.SpriteMaterial({ map: badgeTexture(icon, color), depthWrite: false, fog: false, transparent: true });
  const badge = new THREE.Sprite(spriteMat);
  const baseY = (tall ? 8 : 4.6) * size;
  badge.position.y = baseY;
  group.add(badge);
  const sign = makeSign("", label, color, { big: tall });
  sign.sprite.position.y = (tall ? 13 : 7.6) * size;
  group.add(sign.sprite);
  const R = 5.4 * size * (tall ? 1 : 0.6);
  const phase = Math.random();
  return {
    group,
    icon: badge,
    badgeIcon: icon,
    sign: sign.sprite,
    /** `t` seconds, `d` metres from the player. */
    tick(t: number, d = 100) {
      const fade = markerFade(d);
      const k = (t * 0.7 + phase) % 1;
      r1.scale.setScalar(R * (0.5 + k * 0.5));
      ringMat.opacity = 0.9 * fade * (1 - k) * (1 - k * 0.3);
      if (r2) r2.scale.setScalar(R * (0.5 + ((k + 0.5) % 1) * 0.5));
      if (pillarMat && column) {
        pillarMat.uniforms.time.value = t;
        pillarMat.uniforms.fade.value = fade;
        const w = 1.5 * size * markerScale(d);
        column.scale.set(w, 1, w);
      }
      // A steady size on screen from afar, shrinking to a small badge when you are on top of it.
      badge.scale.setScalar((2.2 + Math.min(3.2, d / 70)) * size * (0.55 + 0.45 * markerScale(d, 6, 40)));
      badge.position.y = baseY + Math.sin(t * 1.8 + phase * 6) * 0.35;
      spriteMat.opacity = 0.35 + 0.65 * Math.min(1, d / 14);
    },
    dispose() {
      pillarMat?.dispose();
      ringMat.dispose();
      spriteMat.dispose();
      sign.dispose();
    },
  };
}

// ---------------------------------------------------------------- pickups
/** A pickup: a six-sided token that bobs and turns, a rarity rim, a ground ring; `collect()` bursts it. */
export function makeLoot(icon: IconName, rarity: Rarity = "common") {
  const rim = RARITY_COLORS[rarity];
  const group = new THREE.Group();
  const cap = new THREE.MeshBasicMaterial({ map: badgeTexture(icon, rim), transparent: true, fog: false });
  const side = new THREE.MeshBasicMaterial({ color: rim, transparent: true, fog: false });
  const tok = new THREE.Mesh(token(), [side, cap, cap]);
  tok.scale.setScalar(rarity === "common" ? 1.25 : rarity === "rare" ? 1.45 : 1.65);
  group.add(tok);
  const ringMat = new THREE.MeshBasicMaterial({ color: rim, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide });
  const ground = new THREE.Mesh(ring(), ringMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.15;
  ground.scale.setScalar(1.7);
  group.add(ground);
  const burstMat = new THREE.MeshBasicMaterial({ color: rim, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const burst = new THREE.Mesh(ring(), burstMat);
  burst.rotation.x = -Math.PI / 2;
  burst.position.y = 0.25;
  burst.visible = false;
  group.add(burst);
  const phase = Math.random() * 6;
  let burstAt = -1;
  let clock = 0;
  const BURST_S = 0.5;
  return {
    group,
    icon: tok as THREE.Object3D,
    collect() {
      if (burstAt < 0) burstAt = clock;
    },
    /** `t` seconds, `d` metres from the player. */
    tick(t: number, d = 50) {
      clock = t;
      if (burstAt >= 0) {
        const k = (t - burstAt) / BURST_S;
        if (k >= 1) return void (group.visible = false);
        // The token leaps up, swells and fades; a ring runs out along the ground.
        tok.position.y = 2.4 + k * 2.2;
        tok.scale.setScalar(1.4 * (1 + k * 0.8));
        tok.rotation.y += 0.25;
        side.opacity = cap.opacity = 1 - k;
        ground.visible = false;
        burst.visible = true;
        burst.scale.setScalar(1.5 + k * 5);
        burstMat.opacity = 0.9 * (1 - k);
        return;
      }
      tok.rotation.y = t * 1.1 + phase; // slow turn
      tok.position.y = 2.3 + Math.sin(t * 1.9 + phase) * 0.3;
      const f = markerFade(d, 6, 160);
      side.opacity = cap.opacity = 0.25 + 0.75 * f;
      ringMat.opacity = 0.6 * f * (0.7 + 0.3 * Math.sin(t * 2.4 + phase));
    },
    dispose() {
      cap.dispose();
      side.dispose();
      ringMat.dispose();
      burstMat.dispose();
    },
  };
}
