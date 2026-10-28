"use client";
// The gun in your hands in first person. Drawn in its own little scene after the city
// (depth cleared), so it never pokes into a wall you stand against. It bobs with your
// stride, lags a touch behind your look, kicks back when it fires, dips while reloading,
// and comes up to the eye when you aim down the sights (a sniper's scope takes over the
// whole screen instead — that's the HUD's job).
import * as THREE from "three";
import type { WeaponKey } from "@/lib/arena/weapons";
import { loadWeapons } from "./avatar";

/** The guns are life-size; in the hand they're drawn a little smaller, like every shooter does. */
const SCALE = 0.78;
const HIP = new THREE.Vector3(0.17, -0.19, -0.42);
// Aiming: the sight's top on the screen's centre line (sight heights from the Blender model × SCALE).
const ADS: Record<WeaponKey, THREE.Vector3> = {
  pistol: new THREE.Vector3(0, -0.066, -0.36),
  smg: new THREE.Vector3(0, -0.104, -0.32),
  rifle: new THREE.Vector3(0, -0.106, -0.3),
  sniper: new THREE.Vector3(0, -0.118, -0.24),
  shotgun: new THREE.Vector3(0, -0.08, -0.34),
};

export class Viewmodel {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private rig = new THREE.Group();
  private guns = new Map<WeaponKey, THREE.Object3D>();
  private muzzles = new Map<WeaponKey, THREE.Object3D>();
  private flash: THREE.Sprite;
  private weapon: WeaponKey = "rifle";
  private kick = 0;
  private bobT = 0;
  private swayX = 0;
  private swayY = 0;
  private adsK = 0;
  private reloadK = 0;
  private flashT = 0;
  private gloves: THREE.Mesh[] = [];

  constructor(aspect: number, flashTex?: THREE.Texture) {
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.01, 10);
    this.scene.add(new THREE.HemisphereLight("#ffffff", "#5a5a50", 1.6));
    const sun = new THREE.DirectionalLight("#ffffff", 1.8);
    sun.position.set(0.5, 1, 0.3);
    this.scene.add(sun);
    this.scene.add(this.rig);
    this.rig.scale.setScalar(SCALE);
    const glove = new THREE.MeshStandardMaterial({ color: "#24262a", roughness: 0.8 });
    const sleeve = new THREE.MeshStandardMaterial({ color: "#7d8a6a", roughness: 0.9 });
    // Two gloved hands and forearms in sleeves.
    for (const [x, y, z, rot] of [[0.0, -0.03, 0.02, 0.2], [-0.02, 0.01, -0.22, -0.4]] as const) {
      const hand = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.1), glove);
      hand.position.set(x, y, z);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 0.3, 8), sleeve);
      arm.rotation.x = Math.PI / 2 + rot;
      arm.position.set(x + 0.02, y - 0.06, z + 0.17);
      this.rig.add(hand, arm);
      this.gloves.push(hand, arm);
    }
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTex ?? null, color: "#ffd38a", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.flash.scale.setScalar(0.12);
    this.flash.visible = false;
    this.rig.add(this.flash);
    loadWeapons()
      .then((m) => {
        for (const [k, src] of m) {
          const g = src.clone(true);
          // Barrel along -z (the glTF export's forward), grip at the origin.
          g.position.set(0, 0, 0);
          g.traverse((o) => {
            const m = o as THREE.Mesh;
            if (!m.isMesh) return;
            m.frustumCulled = false;
            // This little scene has no environment to reflect: full metal would render black.
            const mat = (m.material as THREE.MeshStandardMaterial).clone();
            mat.metalness = Math.min(0.3, mat.metalness);
            mat.roughness = Math.max(0.45, mat.roughness);
            m.material = mat;
          });
          this.rig.add(g);
          this.guns.set(k, g);
          const mz = g.getObjectByName(`fpmuzzle_${k}`);
          if (mz) this.muzzles.set(k, mz);
        }
        this.setWeapon(this.weapon);
      })
      .catch(() => {});
  }

  setWeapon(w: WeaponKey) {
    this.weapon = w;
    for (const [k, g] of this.guns) g.visible = k === w;
  }

  fire(strength: number) {
    this.kick = Math.min(1.4, this.kick + 0.5 + strength * 2);
    this.flashT = 0.05;
  }

  resize(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /**
   * speed: how fast you're moving (m/s); look: how far the view turned this frame (rad);
   * ads 0…1; reloading 0…1 of the way through (or -1).
   */
  update(dt: number, o: { speed: number; lookX: number; lookY: number; ads: boolean; reload: number; air: boolean; sprint: boolean }) {
    this.adsK += ((o.ads ? 1 : 0) - this.adsK) * Math.min(1, dt * 14);
    this.reloadK += ((o.reload >= 0 ? 1 : 0) - this.reloadK) * Math.min(1, dt * 10);
    this.kick *= Math.exp(-dt * 14);
    const moving = Math.min(1, o.speed / 5);
    this.bobT += dt * (4 + o.speed * 1.6) * (o.air ? 0.2 : 1);
    const bobK = moving * (1 - this.adsK * 0.85);
    this.swayX += (-o.lookX * 0.9 - this.swayX) * Math.min(1, dt * 10);
    this.swayY += (o.lookY * 0.9 - this.swayY) * Math.min(1, dt * 10);
    const base = HIP.clone().lerp(ADS[this.weapon], this.adsK);
    const r = this.rig;
    r.position.set(
      base.x + Math.sin(this.bobT) * 0.012 * bobK + this.swayX * 0.04 * (1 - this.adsK * 0.7),
      base.y + Math.abs(Math.cos(this.bobT)) * 0.01 * bobK - this.reloadK * 0.12 - (o.sprint ? 0.03 : 0) + this.swayY * 0.03,
      base.z + this.kick * 0.035,
    );
    r.rotation.set(this.kick * 0.06 - this.reloadK * 0.6 + (o.sprint ? -0.25 : 0), this.swayX * 0.4 + (o.sprint ? 0.5 : 0), this.reloadK * 0.4 + Math.sin(this.bobT) * 0.01 * bobK);
    this.camera.fov = 60 - this.adsK * 8;
    this.camera.updateProjectionMatrix();
    this.flashT -= dt;
    const mz = this.muzzles.get(this.weapon);
    this.flash.visible = this.flashT > 0 && !!mz;
    if (mz && this.flash.visible) {
      mz.getWorldPosition(this.flash.position);
      this.rig.worldToLocal(this.flash.position);
      this.flash.material.rotation = Math.random() * 6;
    }
  }

  /** Hide it (sniper scope up, dead, driving). */
  set visible(v: boolean) {
    this.rig.visible = v;
  }

  render(renderer: THREE.WebGLRenderer) {
    if (!this.rig.visible) return;
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = auto;
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        if (this.gloves.includes(m)) m.geometry.dispose();
      }
    });
    this.flash.material.dispose();
  }
}
