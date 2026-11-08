// Procedural surface detail for the realistic city, generated once on the device (no
// downloads): tileable asphalt (aggregate, cracks, sealed patches), pavement slabs, and a
// soft multi-octave noise for large-scale variation, puddles and clouds. Each surface packs
// a tangent-space normal (RG), roughness (B) and an albedo multiplier (A, 0.5 = ×1) into one
// RGBA8 texture. The generators are pure arrays (tests check them); `toTexture` wraps them.
import * as THREE from "three";

/** Deterministic PRNG (mulberry32). */
export function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value-noise fBm over an S×S grid, in [0, 1]. `cells`: lattice cells across at the first octave. */
export function fbm(S: number, cells: number, octaves: number, seed: number): Float32Array {
  const out = new Float32Array(S * S);
  let amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = cells << o;
    const r = prng(seed + o * 1013);
    const lat = new Float32Array(n * n);
    for (let i = 0; i < lat.length; i++) lat[i] = r();
    for (let y = 0; y < S; y++) {
      const fy = (y / S) * n, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
      const y0 = (iy % n) * n, y1 = ((iy + 1) % n) * n;
      for (let x = 0; x < S; x++) {
        const fx = (x / S) * n, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
        const x0 = ix % n, x1 = (ix + 1) % n;
        const a = lat[y0 + x0] + (lat[y0 + x1] - lat[y0 + x0]) * sx;
        const b = lat[y1 + x0] + (lat[y1 + x1] - lat[y1 + x0]) * sx;
        out[y * S + x] += (a + (b - a) * sy) * amp;
      }
    }
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}

/** Tangent-space normals from a tileable height field (central differences, wrapping). Returns [nx, ny] pairs in −1…1. */
export function heightToNormal(h: Float32Array, S: number, strength: number): Float32Array {
  const n = new Float32Array(S * S * 2);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const l = h[y * S + ((x - 1 + S) % S)], r = h[y * S + ((x + 1) % S)];
      const d = h[((y - 1 + S) % S) * S + x], u = h[((y + 1) % S) * S + x];
      let nx = (l - r) * strength, ny = (d - u) * strength;
      const len = Math.hypot(nx, ny, 1);
      nx /= len;
      ny /= len;
      n[(y * S + x) * 2] = nx;
      n[(y * S + x) * 2 + 1] = ny;
    }
  return n;
}

/** Pack normal (RG), roughness (B) and albedo multiplier (A: value × 0.5) into RGBA8. */
export function pack(S: number, normal: Float32Array, rough: Float32Array, albedo: Float32Array) {
  const out = new Uint8Array(S * S * 4);
  const b = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  for (let i = 0; i < S * S; i++) {
    out[i * 4] = b(normal[i * 2] * 0.5 + 0.5);
    out[i * 4 + 1] = b(normal[i * 2 + 1] * 0.5 + 0.5);
    out[i * 4 + 2] = b(rough[i]);
    out[i * 4 + 3] = b(albedo[i] * 0.5);
  }
  return out;
}

/** Visit the texels under a soft line (wrapping), with a 0–1 weight: cracks. */
function stroke(S: number, x0: number, y0: number, x1: number, y1: number, w: number, apply: (i: number, k: number) => void) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(len * 2));
  for (let s = 0; s <= steps; s++) {
    const cx = x0 + ((x1 - x0) * s) / steps, cy = y0 + ((y1 - y0) * s) / steps;
    for (let dy = -Math.ceil(w); dy <= Math.ceil(w); dy++)
      for (let dx = -Math.ceil(w); dx <= Math.ceil(w); dx++) {
        const d = Math.hypot(dx, dy);
        if (d > w) continue;
        const x = (((Math.round(cx) + dx) % S) + S) % S, y = (((Math.round(cy) + dy) % S) + S) % S;
        apply(y * S + x, 1 - d / (w + 0.5));
      }
  }
}

/** Asphalt, one tile = 4 m: aggregate, a few cracks, a sealed patch or two. */
export function asphaltData(S = 512, seed = 7) {
  const r = prng(seed);
  const h = fbm(S, 64, 3, seed);
  const fine = fbm(S, 256, 1, seed + 5);
  const rough = new Float32Array(S * S), alb = new Float32Array(S * S);
  for (let i = 0; i < S * S; i++) {
    h[i] = h[i] * 0.6 + fine[i] * 0.4;
    rough[i] = 0.86 + (fine[i] - 0.5) * 0.12;
    alb[i] = 1 + (h[i] - 0.5) * 0.3;
  }
  // Stones in the mix: small raised, slightly polished, lighter chips.
  for (let k = 0; k < S * S * 0.012; k++) {
    const x = Math.floor(r() * S), y = Math.floor(r() * S), rad = 0.8 + r() * 1.6, lift = 0.25 + r() * 0.35;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const d = Math.hypot(dx, dy);
        if (d > rad) continue;
        const i = ((y + dy + S) % S) * S + ((x + dx + S) % S);
        h[i] += lift * (1 - d / (rad + 0.5));
        rough[i] = Math.min(rough[i], 0.62 + r() * 0.1);
        alb[i] = Math.max(alb[i], 1.05 + r() * 0.25);
      }
  }
  // Sealed patches: smoother, darker rectangles of newer tarmac.
  for (let k = 0; k < 2; k++) {
    const x0 = Math.floor(r() * S), y0 = Math.floor(r() * S), w = 40 + r() * 90, hh = 30 + r() * 70;
    for (let y = 0; y < hh; y++)
      for (let x = 0; x < w; x++) {
        const i = ((y0 + y) % S) * S + ((x0 + x) % S);
        const edge = Math.min(x, y, w - x, hh - y) < 2;
        alb[i] *= edge ? 0.7 : 0.78;
        rough[i] = edge ? 0.9 : 0.74;
        if (edge) h[i] -= 0.15;
      }
  }
  // Cracks: wandering lines, sunk and dark.
  for (let k = 0; k < 3; k++) {
    let x = r() * S, y = r() * S, a = r() * Math.PI * 2;
    const n = 12 + Math.floor(r() * 30);
    for (let s = 0; s < n; s++) {
      a += (r() - 0.5) * 1.1;
      const nx = x + Math.cos(a) * 4, ny = y + Math.sin(a) * 4;
      stroke(S, x, y, nx, ny, 0.7, (i, kk) => {
        h[i] -= 0.35 * kk;
        alb[i] *= 1 - 0.25 * kk;
        rough[i] = Math.max(rough[i], 0.95);
      });
      x = nx;
      y = ny;
    }
  }
  return pack(S, heightToNormal(h, S, 2.2), rough, alb);
}

/** Pavement slabs, one tile = 2 m: 4 × 4 slabs of 50 cm with sunk joints and a little unevenness. */
export function pavingData(S = 256, seed = 11) {
  const r = prng(seed);
  const n = fbm(S, 32, 3, seed);
  const h = new Float32Array(S * S), rough = new Float32Array(S * S), alb = new Float32Array(S * S);
  const slab = S / 4;
  const tone = Array.from({ length: 16 }, () => 0.9 + r() * 0.18);
  const tilt = Array.from({ length: 16 }, () => [(r() - 0.5) * 0.25, (r() - 0.5) * 0.25]);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const sx = Math.floor(x / slab), sy = Math.floor(y / slab), k = sy * 4 + sx;
      const lx = x % slab, ly = y % slab;
      const joint = Math.min(lx, ly, slab - 1 - lx, slab - 1 - ly);
      const inJoint = joint < 2;
      h[i] = inJoint ? 0.2 + joint * 0.2 : 1 + (lx / slab - 0.5) * tilt[k][0] + (ly / slab - 0.5) * tilt[k][1] + (n[i] - 0.5) * 0.15;
      rough[i] = inJoint ? 0.97 : 0.8 + (n[i] - 0.5) * 0.1;
      alb[i] = inJoint ? 0.68 : tone[k] * (0.95 + (n[i] - 0.5) * 0.2);
    }
  return pack(S, heightToNormal(h, S, 3), rough, alb);
}

/** Large-scale variation: R and G two independent soft fBms, B a finer one. Tileable. */
export function noiseData(S = 256, seed = 3) {
  const a = fbm(S, 4, 5, seed), b = fbm(S, 6, 4, seed + 77), c = fbm(S, 16, 3, seed + 151);
  const out = new Uint8Array(S * S * 4);
  for (let i = 0; i < S * S; i++) {
    out[i * 4] = Math.round(a[i] * 255);
    out[i * 4 + 1] = Math.round(b[i] * 255);
    out[i * 4 + 2] = Math.round(c[i] * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}

export function toTexture(data: Uint8Array, S: number, anisotropy: number) {
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = anisotropy;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

let shared: { asphalt: THREE.DataTexture; paving: THREE.DataTexture; noise: THREE.DataTexture; users: number } | null = null;
/** The surfaces, built on first use and shared by every material until the last one lets go. */
export function surfaces(anisotropy: number) {
  shared ??= { asphalt: toTexture(asphaltData(), 512, anisotropy), paving: toTexture(pavingData(), 256, anisotropy), noise: toTexture(noiseData(), 256, 1), users: 0 };
  shared.users++;
  const s = shared;
  let released = false;
  return {
    asphalt: s.asphalt,
    paving: s.paving,
    noise: s.noise,
    release() {
      if (released) return;
      released = true;
      if (--s.users > 0) return;
      s.asphalt.dispose();
      s.paving.dispose();
      s.noise.dispose();
      if (shared === s) shared = null;
    },
  };
}
