"use client";
// What you see and hear on a skydive (the rules: lib/skydive.ts): the course's rings — gold hoops
// lying flat in the sky, the next one bright and pulsing, the passed ones gone — the landing
// target on the ground (a ring with a bullseye and a tall light to aim for), the coloured smoke
// streaming from your ankles in freefall (the flag's green, white and red), and the wind: a
// roar that rises with your speed and drops to a flutter under the canopy.
import * as THREE from "three";
import { RING_R, type Course } from "@/lib/skydive";
import { audioOut, isMuted } from "../game/sfx";

const SMOKE = 64;
const SMOKE_COLS = ["#239f40", "#ffffff", "#da0000"].map((c) => new THREE.Color(c));
const TMP_M = new THREE.Matrix4(), TMP_Q = new THREE.Quaternion(), TMP_P = new THREE.Vector3(), TMP_S = new THREE.Vector3(), TMP_C = new THREE.Color();

export class Skydive3D {
  private group = new THREE.Group();
  private rings: THREE.InstancedMesh;
  private target: THREE.Group;
  private beam: THREE.Mesh;
  private smoke: THREE.InstancedMesh;
  private puffs: { x: number; y: number; z: number; age: number; c: number }[] = [];
  private nextPuff = 0;
  private course: Course | null = null;
  private wind: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;
  private owned: { dispose: () => void }[] = [];

  constructor(private scene: THREE.Scene, private reduceMotion = false) {
    const own = <T extends { dispose: () => void }>(o: T) => (this.owned.push(o), o);
    this.group.visible = false;
    // Rings: a fat gold torus each, lit (the HDR pass makes them glow).
    this.rings = new THREE.InstancedMesh(own(new THREE.TorusGeometry(RING_R, 0.55, 10, 40)), own(new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped: false })), 8);
    this.rings.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(8 * 3).fill(1), 3);
    this.rings.frustumCulled = false;
    this.rings.count = 0;
    this.group.add(this.rings);
    // The target: rings of white and red on the ground, a bullseye, a beam of light to aim for.
    this.target = new THREE.Group();
    const disc = (r0: number, r1: number, col: string, y: number) => {
      const m = new THREE.Mesh(own(new THREE.RingGeometry(r0, r1, 48)), own(new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide })));
      m.rotation.x = -Math.PI / 2;
      m.position.y = y;
      this.target.add(m);
    };
    disc(13, 15, "#ffffff", 0.06);
    disc(5, 6.5, "#ff2d2d", 0.07);
    disc(0, 2, "#ffd23f", 0.08);
    this.beam = new THREE.Mesh(own(new THREE.CylinderGeometry(0.6, 1.6, 140, 12, 1, true)), own(new THREE.MeshBasicMaterial({ color: "#ffd23f", transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })));
    this.beam.position.y = 70;
    this.target.add(this.beam);
    this.group.add(this.target);
    // Smoke: soft puffs that grow and fade behind you.
    this.smoke = new THREE.InstancedMesh(own(new THREE.IcosahedronGeometry(1, 1)), own(new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.55, depthWrite: false })), SMOKE);
    this.smoke.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(SMOKE * 3).fill(1), 3);
    this.smoke.frustumCulled = false;
    this.smoke.count = 0;
    this.group.add(this.smoke);
    scene.add(this.group);
  }

  /** A jump starts (with its course, or none from the helicopter) or ends (null). `floorAt`: the ground's height under the target. */
  set(course: Course | null, on: boolean, floorAt = 0) {
    this.course = course;
    this.group.visible = on;
    this.puffs = [];
    this.smoke.count = 0;
    this.target.visible = !!course;
    if (course) this.target.position.set(course.target.x, floorAt, course.target.z);
    this.windOn(on);
  }

  /** Each frame while jumping: where you are, how fast, freefall or not. */
  update(dt: number, t: number, me: { x: number; z: number; alt: number; vx: number; vz: number; vy: number }, free: boolean) {
    if (!this.group.visible) return;
    // Rings: the next one gold and pulsing, the rest dimmer; passed ones gone.
    let n = 0;
    const next = this.course?.rings.find((r) => !r.hit);
    for (const r of this.course?.rings ?? []) {
      if (r.hit) continue;
      const pulse = r === next && !this.reduceMotion ? 1 + 0.06 * Math.sin(t * 6) : 1;
      TMP_Q.setFromAxisAngle(TMP_P.set(1, 0, 0), Math.PI / 2);
      this.rings.setMatrixAt(n, TMP_M.compose(TMP_P.set(r.x, r.alt, r.z), TMP_Q, TMP_S.setScalar(pulse)));
      this.rings.setColorAt(n, TMP_C.set(r === next ? "#ffd23f" : "#c7a03a").multiplyScalar(r === next ? 2.2 : 0.9));
      n++;
    }
    this.rings.count = n;
    this.rings.instanceMatrix.needsUpdate = true;
    if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.12 + 0.08 * Math.sin(t * 2.5);
    // Smoke from the ankles in freefall, a puff every few hundredths of a second.
    if (free && !this.reduceMotion) {
      this.nextPuff -= dt;
      if (this.nextPuff <= 0) {
        this.nextPuff = 0.035;
        this.puffs.push({ x: me.x, y: me.alt + 0.3, z: me.z, age: 0, c: Math.floor(t * 3) % 3 });
        if (this.puffs.length > SMOKE) this.puffs.shift();
      }
    }
    let k = 0;
    for (const p of this.puffs) {
      p.age += dt;
      if (p.age > 2.4) continue;
      const s = 0.5 + p.age * 1.6;
      this.smoke.setMatrixAt(k, TMP_M.compose(TMP_P.set(p.x, p.y + p.age * 0.4, p.z), TMP_Q.identity(), TMP_S.setScalar(s)));
      this.smoke.setColorAt(k, TMP_C.copy(SMOKE_COLS[p.c]).multiplyScalar(Math.max(0, 1 - p.age / 2.4)));
      k++;
    }
    this.smoke.count = k;
    this.smoke.instanceMatrix.needsUpdate = true;
    if (this.smoke.instanceColor) this.smoke.instanceColor.needsUpdate = true;
    // The wind: loud and bright in freefall, soft under the canopy.
    const speed = Math.hypot(me.vx, me.vz, me.vy);
    if (this.wind) {
      const ctx = this.wind.gain.context;
      const want = isMuted() ? 0 : free ? Math.min(0.55, 0.12 + speed / 120) : 0.06 + speed / 300;
      this.wind.gain.gain.setTargetAtTime(want, ctx.currentTime, 0.15);
      this.wind.filter.frequency.setTargetAtTime(free ? 500 + speed * 22 : 380, ctx.currentTime, 0.2);
    }
  }

  private windOn(on: boolean) {
    if (!on) {
      if (this.wind) {
        const w = this.wind;
        w.gain.gain.setTargetAtTime(0, w.gain.context.currentTime, 0.1);
        setTimeout(() => {
          try {
            w.src.stop();
          } catch {}
        }, 400);
        this.wind = null;
      }
      return;
    }
    if (this.wind) return;
    const out = audioOut("vehicles");
    if (!out) return;
    const { ctx } = out;
    // Pink-ish noise through a band-pass: rushing air.
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99 * b0 + w * 0.08;
      b1 = 0.9 * b1 + w * 0.25;
      d[i] = (b0 + b1 + w * 0.15) * 0.4;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.Q.value = 0.6;
    filter.frequency.value = 800;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(out.out);
    src.start();
    this.wind = { src, gain, filter };
  }

  dispose() {
    this.windOn(false);
    this.scene.remove(this.group);
    this.rings.dispose();
    this.smoke.dispose();
    for (const o of this.owned) o.dispose();
  }
}
