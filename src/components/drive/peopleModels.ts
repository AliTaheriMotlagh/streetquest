"use client";
// Real rigged people for the pavements (scripts/people.ts builds them; lib/peopleModels.ts
// lists them): loaded once when drive mode opens, then cloned per person near you.
//  - Each model is measured the way three.js draws it — posed in the first frame of its
//    idle clip and skinned — then scaled to its real height, stood on y = 0 and turned so
//    the toes point −z (the city's forward). The source rigs' stored rest pose lies flat,
//    so nothing is trusted before that.
//  - A person is a skeleton clone sharing geometry, textures and (per tint) materials, with
//    its own animation mixer: walk / run matched to the ground speed, idle, and a fall
//    played once (a model without one is tipped over by the crowd code instead).
import * as THREE from "three";
import { clone as cloneSkinned } from "three/examples/jsm/utils/SkeletonUtils.js";
import { PEOPLE_MODELS, type PersonClip } from "@/lib/peopleModels";
import { loadAnimated } from "./gltf";

export type PersonTemplate = {
  key: string;
  /** The normalised figure (feet at the origin, facing −z). */
  scene: THREE.Object3D;
  clips: Map<PersonClip, THREE.AnimationClip>;
  pace: { walk: number; run: number };
};

let loading: Promise<PersonTemplate[]> | null = null;

/** Every person model (the ones that fail to load are left out; none at all → []). */
export function loadPeople(): Promise<PersonTemplate[]> {
  loading ??= Promise.all(PEOPLE_MODELS.map((m) => template(m.key, m.url, m.height, m.pace).catch(() => null))).then((l) => l.filter((x): x is PersonTemplate => !!x));
  return loading;
}

const v = new THREE.Vector3();

async function template(key: string, url: string, height: number, pace: PersonTemplate["pace"]): Promise<PersonTemplate> {
  const { scene, clips } = await loadAnimated(url);
  const byName = new Map<PersonClip, THREE.AnimationClip>();
  for (const c of clips) byName.set(c.name as PersonClip, c);
  // Stand it up: the first frame of the idle clip.
  const idle = byName.get("idle") ?? byName.get("walk");
  const mixer = new THREE.AnimationMixer(scene);
  if (idle) mixer.clipAction(idle).play();
  mixer.update(0);
  scene.updateMatrixWorld(true);
  const box = new THREE.Box3();
  scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (!m.isSkinnedMesh) return;
    m.skeleton.update();
    const pos = m.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i += 2) box.expandByPoint(m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld));
  });
  // Which way the toes point.
  let fx = 0, fz = 0;
  for (const side of ["L", "R"]) {
    const foot = find(scene, new RegExp(`^foot_${side}`, "i")), toe = find(scene, new RegExp(`^toes?_${side}`, "i"));
    if (!foot || !toe) continue;
    const a = foot.getWorldPosition(new THREE.Vector3()), b = toe.getWorldPosition(new THREE.Vector3());
    (fx += b.x - a.x), (fz += b.z - a.z);
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
  const k = height / Math.max(0.01, box.max.y - box.min.y);
  const norm = new THREE.Group();
  norm.add(scene);
  norm.scale.setScalar(k);
  norm.position.set(-((box.min.x + box.max.x) / 2) * k, -box.min.y * k, -((box.min.z + box.max.z) / 2) * k);
  const turn = new THREE.Group();
  turn.name = key;
  turn.add(norm);
  turn.rotation.y = fx || fz ? -Math.atan2(-fx, -fz) : 0;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.frustumCulled = false; // skinned bounds don't follow the animation
    m.castShadow = m.receiveShadow = false;
  });
  return { key, scene: turn, clips: byName, pace };
}

function find(root: THREE.Object3D, re: RegExp) {
  let hit: THREE.Object3D | null = null;
  root.traverse((o) => {
    if (!hit && re.test(o.name)) hit = o;
  });
  return hit as THREE.Object3D | null;
}

/** Clothes in a few shades per model, so a street of the same three men doesn't look cloned. */
const TINTS = [new THREE.Color(1, 1, 1), new THREE.Color(0.78, 0.82, 0.9), new THREE.Color(1, 0.92, 0.8), new THREE.Color(0.7, 0.7, 0.7)];
export const TINT_COUNT = TINTS.length;
const tinted = new Map<string, THREE.Material>();
function tint(mat: THREE.Material, i: number) {
  if (!i) return mat;
  const key = `${mat.uuid}|${i}`;
  let m = tinted.get(key);
  if (!m) {
    m = mat.clone();
    (m as THREE.MeshStandardMaterial).color?.multiply(TINTS[i]);
    tinted.set(key, m);
  }
  return m;
}

type Play = "walk" | "run" | "idle" | "fall";

/** One person drawn from a model: its own skeleton and mixer. */
export class PersonModel {
  readonly group = new THREE.Group();
  private mixer: THREE.AnimationMixer;
  private actions = new Map<Play, THREE.AnimationAction>();
  private now: Play | null = null;
  private acc = 0;
  readonly hasFall: boolean;

  constructor(readonly tpl: PersonTemplate, tintIdx: number) {
    const body = cloneSkinned(tpl.scene);
    body.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) m.material = Array.isArray(m.material) ? m.material.map((x) => tint(x, tintIdx)) : tint(m.material, tintIdx);
    });
    this.group.add(body);
    this.mixer = new THREE.AnimationMixer(body);
    for (const [name, clip] of tpl.clips) {
      const a = this.mixer.clipAction(clip);
      if (name === "fall") {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(name, a);
    }
    this.hasFall = tpl.clips.has("fall");
    this.play("idle", 0);
  }

  private play(c: Play, fade = 0.2) {
    if (c === this.now) return;
    const next = this.actions.get(c) ?? this.actions.get("idle");
    if (!next) return;
    const prev = this.now ? this.actions.get(this.now) : null;
    next.reset().setEffectiveWeight(1).play();
    if (prev && prev !== next) next.crossFadeFrom(prev, fade, false);
    this.now = c;
  }

  /**
   * Pose for this frame: `speed` on the ground (m/s) picks walk / run / idle and matches the
   * cycle to it; `down` plays the fall once and stays there. `far` (m) thins updates out.
   */
  update(dt: number, speed: number, down: boolean, far: number) {
    if (down) this.play("fall", 0.12);
    else if (speed < 0.25) this.play("idle");
    else if (speed > 2.4) this.play("run", 0.15);
    else this.play("walk");
    const a = this.now && this.actions.get(this.now);
    if (a && (this.now === "walk" || this.now === "run")) a.timeScale = Math.max(0.5, Math.min(2.2, speed / (this.now === "run" ? this.tpl.pace.run : this.tpl.pace.walk)));
    this.acc += dt;
    const every = far > 45 ? 1 / 15 : far > 25 ? 1 / 30 : 0;
    if (this.acc < every) return;
    this.mixer.update(this.acc);
    this.acc = 0;
  }

  /** Start from the top (a walker taking this body over). */
  reset() {
    this.mixer.stopAllAction();
    this.now = null;
    this.play("idle", 0);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.group.removeFromParent();
  }
}
