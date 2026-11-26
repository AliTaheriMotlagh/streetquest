"use client";
// A soldier in the 3D city (the Blender model, assets/blender/arena.py): every player on
// foot, mine in third person, bots in a match.
//  - One download for everyone; each avatar is a skeleton clone sharing the geometry.
//  - Legs from the animation set (idle / walk / run / back / strafe / crouch / jump /
//    death), picked from the velocity relative to where they face and speed-matched so
//    feet don't skate; the torso and arms bend to the aim pitch on top of it.
//  - Uniform and accent (helmet band, arm bands) tinted per player / team.
//  - Far away the animation updates less often; past the fog it isn't drawn at all.
import * as THREE from "three";
import { slopePose } from "@/lib/walkSlope";
import { armDirs, punchCurve, PUNCH_S, type Punch } from "@/lib/street/melee";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { WEAPON_KEYS, type WeaponKey } from "@/lib/arena/weapons";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { loadModel } from "../drive/gltf";
import { toonRamp } from "../drive/world3d";
import { modelUrl } from "../drive/modelOverride";

const SOLDIER_URL = "/models/arena/soldier.glb";
const WEAPONS_URL = "/models/arena/weapons.glb";

type Template = { scene: THREE.Object3D; clips: THREE.AnimationClip[] };
let soldier: Promise<Template> | null = null;
let weapons: Promise<Map<WeaponKey, THREE.Object3D>> | null = null;

/** The soldier model and its animations (downloaded once). */
export function loadSoldier(): Promise<Template> {
  soldier ??= (async () => {
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    draco.setWorkerLimit(1);
    const l = new GLTFLoader();
    l.setDRACOLoader(draco);
    const g = await l.loadAsync(await modelUrl(SOLDIER_URL));
    return { scene: g.scene, clips: g.animations };
  })().catch((e) => {
    soldier = null;
    throw e;
  });
  return soldier;
}

const POLICE_URL = "/models/arena/police.glb";
let police: Promise<Template> | null = null;

/**
 * The street's police officer: a real character on the soldier's skeleton (same clips and
 * guns — assets/blender/police.py), else the soldier itself when that model isn't there.
 */
export function loadPolice(): Promise<Template> {
  police ??= (async () => {
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    draco.setWorkerLimit(1);
    const l = new GLTFLoader();
    l.setDRACOLoader(draco);
    const g = await l.loadAsync(await modelUrl(POLICE_URL));
    return { scene: g.scene, clips: g.animations };
  })().catch(() => {
    police = null;
    return loadSoldier();
  });
  return police;
}

const CIVILIAN_URL = "/models/arena/civilian.glb";
let civilian: Promise<Template> | null = null;

/**
 * The main character: a plain-clothes Tehrani everyman on the soldier's skeleton (built by
 * assets/blender/civilian.py from a CC-BY character), so he plays every one of the soldier's
 * animations and holds its guns. Falls back to the soldier when the model isn't built.
 */
export function loadCivilian(): Promise<Template> {
  civilian ??= (async () => {
    const draco = new DRACOLoader();
    draco.setDecoderPath("/draco/");
    draco.setWorkerLimit(1);
    const l = new GLTFLoader();
    l.setDRACOLoader(draco);
    const g = await l.loadAsync(await modelUrl(CIVILIAN_URL));
    return { scene: g.scene, clips: g.animations };
  })().catch(() => {
    civilian = null;
    return loadSoldier();
  });
  return civilian;
}

/** The guns on their own (first-person view), each with its muzzle point. */
export function loadWeapons() {
  weapons ??= loadModel(WEAPONS_URL)
    .then((root) => {
      const out = new Map<WeaponKey, THREE.Object3D>();
      for (const k of WEAPON_KEYS) {
        const o = root.getObjectByName(`fp_${k}`);
        if (o) out.set(k, o);
      }
      return out;
    })
    .catch((e) => {
      weapons = null;
      throw e;
    });
  return weapons;
}

export type Pose = {
  /** World velocity (m/s). */
  vx: number;
  vz: number;
  yaw: number;
  pitch: number;
  crouch: boolean;
  air: boolean;
  dead: boolean;
  /**
   * Hero moves (combat.ts heroLean): where the head points in the world (along the line on a
   * swing, flat in a glide, head first in a dive), and a flip or roll under way (0…1). The body
   * turns about the hips, eased, on top of whatever clip plays.
   */
  stunt?: { up: { x: number; y: number; z: number } | null; spin: number; kind: "flip" | "roll" } | null;
  /** The ground's slope where it faces (rad, + = uphill ahead; lib/walkSlope.ts): the gait follows it. */
  slope?: number;
};

type Clip = "Idle" | "Walk" | "Run" | "Back" | "StrafeL" | "StrafeR" | "Crouch" | "CrouchWalk" | "Jump" | "Death";
/** Ground speed (m/s) each cycle was keyed for: playback speeds up to match. */
const NATURAL: Partial<Record<Clip, number>> = { Walk: 1.5, Run: 3.6, Back: 1.4, StrafeL: 1.8, StrafeR: 1.8, CrouchWalk: 1.2 };

/**
 * The city's look: "toon" draws everything with flat banded light, so a soldier in the model's
 * own physically based materials stood out as if lit by another game. Drive.tsx sets it once.
 */
let avatarStyle: "real" | "toon" = "real";
export const setAvatarStyle = (s: "real" | "toon") => void (avatarStyle = s);
/** Soldiers this close cast shadows; further off the shadow is a few pixels, and each one is another skinned pass. */
const SHADOW_M = 45;

/** One material per (model material, look): every soldier shares it, so its shader is built once. */
const lookCache = new Map<string, THREE.Material>();
function looked(mat: THREE.Material): THREE.Material {
  if (avatarStyle !== "toon" || mat.userData.look) return mat;
  const key = `${mat.uuid}|toon`;
  let m = lookCache.get(key);
  if (!m) {
    const src = mat as THREE.MeshStandardMaterial;
    m = new THREE.MeshToonMaterial({ name: src.name, color: src.color?.clone() ?? new THREE.Color("#ffffff"), map: src.map ?? null, gradientMap: toonRamp(), transparent: src.transparent, alphaTest: src.alphaTest, side: src.side });
    m.userData = { ...src.userData, look: true, base: src.userData.base ?? src.name };
    lookCache.set(key, m);
  }
  return m;
}

const tintCache = new Map<string, THREE.Material>();
function tinted(base: THREE.Material, color: string) {
  const key = `${base.uuid}|${color}|${avatarStyle}`;
  let m = tintCache.get(key);
  if (!m) {
    m = looked(base).clone();
    (m as THREE.MeshStandardMaterial).color.set(color);
    m.userData = { ...m.userData, look: true };
    tintCache.set(key, m);
  }
  return m;
}
/** A sphere round the whole body in any pose, shared per geometry: frustum culling without per-frame skinned bounds. */
const spheres = new WeakMap<THREE.BufferGeometry, THREE.Sphere>();
function bodySphere(g: THREE.BufferGeometry): THREE.Sphere {
  let s = spheres.get(g);
  if (!s) {
    if (!g.boundingBox) g.computeBoundingBox();
    s = g.boundingBox!.getBoundingSphere(new THREE.Sphere());
    s.radius *= 2;
    spheres.set(g, s);
  }
  return s.clone();
}

const right = new THREE.Vector3();
const qa = new THREE.Quaternion();
const qp = new THREE.Quaternion();
const axisL = new THREE.Vector3();
const upL = new THREE.Vector3();
const Y = new THREE.Vector3(0, 1, 0), X = new THREE.Vector3(1, 0, 0);
const dirW = new THREE.Vector3(), boneA = new THREE.Vector3(), boneB = new THREE.Vector3(), qAim = new THREE.Quaternion(), qPar = new THREE.Quaternion();
/** Turn `bone` so the line from it to `child` points along `dir` (world, unit). */
function aimBone(bone: THREE.Bone, child: THREE.Object3D, dir: THREE.Vector3) {
  if (!bone.parent) return;
  bone.updateWorldMatrix(true, true);
  bone.getWorldPosition(boneA);
  child.getWorldPosition(boneB);
  const cur = boneB.sub(boneA);
  if (cur.lengthSq() < 1e-8) return;
  qAim.setFromUnitVectors(cur.normalize(), dir);
  // A world-space turn, put into the parent's frame: local' = parent⁻¹ · turn · parent · local.
  bone.parent.getWorldQuaternion(qPar);
  bone.quaternion.premultiply(qPar.clone().invert().multiply(qAim).multiply(qPar));
  bone.updateWorldMatrix(false, true);
}
/** Hip height (m): hero moves turn the body about it. */
const HIP_Y = 0.95;

export class Avatar {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<Clip, THREE.AnimationAction>();
  private current: Clip | null = null;
  private guns = new Map<WeaponKey, THREE.Object3D>();
  private muzzles = new Map<WeaponKey, THREE.Object3D>();
  private spine: THREE.Bone | null = null;
  /** Upper arm, forearm and hand per side (+1 right, −1 left): bare hands pose them (lib/street/melee.ts). */
  private arms = new Map<1 | -1, [THREE.Bone, THREE.Bone, THREE.Bone]>();
  /** Empty-handed: no gun shown, the arms in a guard. */
  private bare = false;
  /** The punch being thrown and when it started (performance.now() ms). */
  private punchNow: (Punch & { t0: number }) | null = null;
  private weapon: WeaponKey = "rifle";
  private acc = 0;
  private deadPlayed = false;
  private meshes: THREE.SkinnedMesh[] = [];
  private uniformBase: THREE.Material | null = null;
  private accentBase: THREE.Material | null = null;
  private shadows: boolean;
  private shadowOn: boolean;
  /** The hips: hero moves lean and flip the body about this (the group's origin is the feet). */
  private hips = new THREE.Group();

  constructor(t: Template, uniform: string, accent: string, shadows: boolean) {
    const root = cloneSkinned(t.scene);
    const bones = new Map<string, THREE.Bone>();
    this.hips.position.y = HIP_Y;
    root.position.y -= HIP_Y;
    this.hips.add(root);
    this.group.add(this.hips);
    this.shadows = this.shadowOn = shadows;
    root.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) {
        m.castShadow = shadows;
        if ((m as THREE.SkinnedMesh).isSkinnedMesh) {
          this.meshes.push(m);
          // Skinned bounds don't follow the animation; a fixed sphere round the body does, so a
          // soldier behind the camera is neither skinned nor drawn (it used to be: culling was off).
          // From the bind pose's box, in the mesh's own space, doubled to hold any pose (lying dead too).
          m.boundingSphere = bodySphere(m.geometry);
        }
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          if (mat.name === "Uniform") this.uniformBase = mat;
          if (mat.name === "Accent") this.accentBase = mat;
        }
        m.material = Array.isArray(m.material) ? m.material.map(looked) : looked(m.material);
      }
      if ((o as THREE.Bone).isBone) {
        if (o.name === "spine") this.spine = o as THREE.Bone;
        // (GLTFLoader drops the dot: "upperarm.R" arrives as "upperarmR".)
        const arm = /^(upperarm|forearm|hand)\.?([LR])$/.exec(o.name);
        if (arm) bones.set(arm[1] + arm[2], o as THREE.Bone);
      }
      const gun = /^gun_(\w+)$/.exec(o.name)?.[1];
      if (gun) this.guns.set(gun as WeaponKey, o);
      const mz = /^muzzle_(\w+)$/.exec(o.name)?.[1];
      if (mz) this.muzzles.set(mz as WeaponKey, o);
    });
    for (const [side, k] of [[1, "R"], [-1, "L"]] as const) {
      const u = bones.get("upperarm" + k), f = bones.get("forearm" + k), h = bones.get("hand" + k);
      if (u && f && h) this.arms.set(side, [u, f, h]);
    }
    this.setColors(uniform, accent);
    this.mixer = new THREE.AnimationMixer(root);
    for (const c of t.clips) {
      const a = this.mixer.clipAction(c);
      if (c.name === "Death" || c.name === "Jump") {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(c.name as Clip, a);
    }
    this.setWeapon("rifle");
    this.play("Idle", 0);
  }

  setColors(uniform: string, accent: string) {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const out = mats.map((mat) => {
        const base = mat.name === "Uniform" || mat.userData.base === "Uniform" ? this.uniformBase : mat.name === "Accent" || mat.userData.base === "Accent" ? this.accentBase : null;
        if (!base) return mat;
        const t = tinted(base, base === this.uniformBase ? uniform : accent);
        t.userData.base = base.name;
        return t;
      });
      m.material = Array.isArray(m.material) ? out : out[0];
    });
  }

  setWeapon(w: WeaponKey) {
    this.weapon = w;
    for (const [k, o] of this.guns) o.visible = !this.bare && k === w;
  }

  /** Empty-handed (fists up) or holding the gun again. */
  setBare(on: boolean) {
    this.bare = on;
    if (!on) this.punchNow = null;
    this.setWeapon(this.weapon);
  }

  /** Throw a punch (bare hands): the arm strikes out over the next PUNCH_S. */
  punch(p: Punch) {
    if (this.bare) this.punchNow = { ...p, t0: performance.now() };
  }

  /** The muzzle of the gun in hand, in world space. */
  muzzle(out: THREE.Vector3) {
    const m = this.muzzles.get(this.weapon);
    if (m) return m.getWorldPosition(out);
    return out.copy(this.group.position).setY(this.group.position.y + 1.4);
  }

  private play(c: Clip, fade = 0.18) {
    if (c === this.current) return;
    const next = this.actions.get(c);
    if (!next) return;
    const prev = this.current ? this.actions.get(this.current) : null;
    next.reset().setEffectiveWeight(1).play();
    if (prev) next.crossFadeFrom(prev, fade, false);
    this.current = c;
  }

  /** Advance the animation. `far` (metres from the camera) thins out updates. */
  update(dt: number, p: Pose, far: number) {
    this.group.rotation.y = p.yaw;
    this.lean(dt, p);
    const sp = Math.hypot(p.vx, p.vz);
    // Velocity in the body's frame: forward is -z at yaw 0.
    const fwd = -Math.sin(p.yaw) * p.vx + -Math.cos(p.yaw) * p.vz;
    const side = Math.cos(p.yaw) * p.vx - Math.sin(p.yaw) * p.vz;
    let clip: Clip;
    if (p.dead) clip = "Death";
    else if (p.air) clip = "Jump";
    else if (p.crouch) clip = sp > 0.5 ? "CrouchWalk" : "Crouch";
    else if (sp < 0.4) clip = "Idle";
    else if (Math.abs(side) > Math.abs(fwd) * 1.2) clip = side > 0 ? "StrafeR" : "StrafeL";
    else if (fwd < -0.3) clip = "Back";
    else clip = sp > 3 ? "Run" : "Walk";
    if (clip === "Death" && this.deadPlayed && this.current === "Death") {
      // Stay down.
    } else this.play(clip, clip === "Death" ? 0.08 : 0.18);
    this.deadPlayed = p.dead;
    const nat = NATURAL[clip];
    const a = this.actions.get(clip);
    if (a) a.timeScale = nat ? Math.max(0.6, Math.min(2.2, sp / nat)) : 1;

    // Shadows only near the camera (toggling castShadow needs no shader rebuild).
    const cast = this.shadows && far < SHADOW_M;
    if (cast !== this.shadowOn) {
      this.shadowOn = cast;
      this.group.traverse((o) => void ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = cast)));
    }
    this.acc += dt;
    const every = far > 140 ? 1 / 12 : far > 60 ? 1 / 24 : 0;
    if (this.acc < every) return;
    this.mixer.update(this.acc);
    this.acc = 0;
    if (p.dead || far > 140) return;
    // Aim: bend at the spine about the body's right axis, on top of the animation (every
    // clip keys the spine, so the next mixer update starts from a clean pose).
    const b = this.spine;
    if (!b?.parent) return;
    this.group.updateMatrixWorld(true);
    right.set(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    b.parent.getWorldQuaternion(qp);
    axisL.copy(right).applyQuaternion(qp.invert());
    // (On a slope the body is tipped into it about the hips — lean — and the spine takes most of that back.)
    qa.setFromAxisAngle(axisL, p.pitch * 0.9 - (p.stunt ? 0 : slopePose(p.slope ?? 0).spine));
    b.quaternion.premultiply(qa);
    if (this.bare && !p.stunt) this.fists(p.yaw);
  }

  /**
   * Bare hands, on top of whatever clip plays (the clips hold a rifle): each arm's bones are turned
   * so they point where lib/street/melee.ts armDirs says — a guard, or the punch under way. Aiming
   * each bone at a direction works whatever way the rig's bones were modelled.
   */
  private fists(yaw: number) {
    const pn = this.punchNow;
    const t = pn ? (performance.now() - pn.t0) / 1000 : -1;
    if (pn && t >= PUNCH_S) this.punchNow = null;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    // Body frame (x right, y up, −z forward) → world: turn by the yaw.
    const toWorld = (v: [number, number, number], out: THREE.Vector3) => out.set(v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c);
    for (const [side, [upper, fore, hand]] of this.arms) {
      const d = armDirs(side, pn && pn.side === side ? punchCurve(t) : 0, !!pn?.hook);
      aimBone(upper, fore, toWorld(d.upper, dirW));
      aimBone(fore, hand, toWorld(d.fore, dirW));
    }
  }

  /** Hero moves: turn the hips toward `stunt.up` (in the body's own frame), then spin a flip or a roll. */
  private lean(dt: number, p: Pose) {
    const st = p.stunt;
    // On a slope (and not mid-stunt): tipped into it about the hips, so the legs swing in the ground's plane.
    const sl = !st && !p.dead && !p.air && p.slope ? slopePose(p.slope) : null;
    if (!st && !sl && this.hips.quaternion.w > 0.9999) return void (this.hips.position.z = 0);
    if (sl) qa.setFromAxisAngle(X, -sl.tilt);
    else if (st?.up) {
      // The world direction into the body's frame (undo the yaw).
      const c = Math.cos(-p.yaw), s = Math.sin(-p.yaw);
      const u = st.up, l = Math.hypot(u.x, u.y, u.z) || 1;
      upL.set((u.x * c + u.z * s) / l, u.y / l, (-u.x * s + u.z * c) / l);
      qa.setFromUnitVectors(Y, upL);
    } else qa.identity();
    this.hips.quaternion.slerp(qa, 1 - Math.exp(-dt * (st ? 10 : 8)));
    if (st && st.spin > 0) {
      // A forward flip (a full turn about the hips' right axis), or a roll that tucks low.
      const k = st.spin, ease = k * k * (3 - 2 * k);
      qp.setFromAxisAngle(X, -Math.PI * 2 * ease);
      this.hips.quaternion.multiply(qp);
      this.hips.position.y = st.kind === "roll" ? HIP_Y * (1 - 0.45 * Math.sin(Math.PI * k)) : HIP_Y;
    } else this.hips.position.y = HIP_Y;
    // (Tipped forward about the hips the feet swing back: the hips forward by as much keeps them under the body.)
    this.hips.position.z = sl ? -HIP_Y * sl.shift : 0;
  }

  dispose() {
    this.mixer.stopAllAction();
    this.group.removeFromParent();
    // Geometry and tinted materials are shared between avatars; nothing else to free.
  }
}
