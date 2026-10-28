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
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { WEAPON_KEYS, type WeaponKey } from "@/lib/arena/weapons";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { loadModel } from "../drive/gltf";

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
    const g = await l.loadAsync(SOLDIER_URL);
    return { scene: g.scene, clips: g.animations };
  })().catch((e) => {
    soldier = null;
    throw e;
  });
  return soldier;
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
};

type Clip = "Idle" | "Walk" | "Run" | "Back" | "StrafeL" | "StrafeR" | "Crouch" | "CrouchWalk" | "Jump" | "Death";
/** Ground speed (m/s) each cycle was keyed for: playback speeds up to match. */
const NATURAL: Partial<Record<Clip, number>> = { Walk: 1.5, Run: 3.6, Back: 1.4, StrafeL: 1.8, StrafeR: 1.8, CrouchWalk: 1.2 };

const tintCache = new Map<string, THREE.Material>();
function tinted(base: THREE.Material, color: string) {
  const key = `${base.uuid}|${color}`;
  let m = tintCache.get(key);
  if (!m) {
    m = base.clone();
    (m as THREE.MeshStandardMaterial).color.set(color);
    tintCache.set(key, m);
  }
  return m;
}

const right = new THREE.Vector3();
const qa = new THREE.Quaternion();
const qp = new THREE.Quaternion();
const axisL = new THREE.Vector3();

export class Avatar {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<Clip, THREE.AnimationAction>();
  private current: Clip | null = null;
  private guns = new Map<WeaponKey, THREE.Object3D>();
  private muzzles = new Map<WeaponKey, THREE.Object3D>();
  private spine: THREE.Bone | null = null;
  private weapon: WeaponKey = "rifle";
  private acc = 0;
  private deadPlayed = false;
  private meshes: THREE.SkinnedMesh[] = [];
  private uniformBase: THREE.Material | null = null;
  private accentBase: THREE.Material | null = null;

  constructor(t: Template, uniform: string, accent: string, shadows: boolean) {
    const root = cloneSkinned(t.scene);
    this.group.add(root);
    root.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) {
        m.castShadow = shadows;
        m.frustumCulled = false; // skinned bounds don't follow the animation
        if ((m as THREE.SkinnedMesh).isSkinnedMesh) this.meshes.push(m);
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
          if (mat.name === "Uniform") this.uniformBase = mat;
          if (mat.name === "Accent") this.accentBase = mat;
        }
      }
      if ((o as THREE.Bone).isBone) {
        if (o.name === "spine") this.spine = o as THREE.Bone;
      }
      const gun = /^gun_(\w+)$/.exec(o.name)?.[1];
      if (gun) this.guns.set(gun as WeaponKey, o);
      const mz = /^muzzle_(\w+)$/.exec(o.name)?.[1];
      if (mz) this.muzzles.set(mz as WeaponKey, o);
    });
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
    for (const [k, o] of this.guns) o.visible = k === w;
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
    qa.setFromAxisAngle(axisL, p.pitch * 0.9);
    b.quaternion.premultiply(qa);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.group.removeFromParent();
    // Geometry and tinted materials are shared between avatars; nothing else to free.
  }
}
