// What you see of a Sky Rings course (the rules: lib/swingRings.ts): upright hoops strung over
// the rooftops. The next one is gold and breathes, with a thin light pillar under it so it can
// be found from streets away; the ones after it are faint white; passed ones are gone. Shared
// geometry, unlit materials, no lights, nothing per frame but a scale and an opacity.
import * as THREE from "three";
import { SWING_RING_R, type SwingCourse } from "@/lib/swingRings";

export class Swing3D {
  private group = new THREE.Group();
  private rings: THREE.Mesh[] = [];
  private pillar: THREE.Mesh;
  private ringGeo = new THREE.TorusGeometry(SWING_RING_R, 0.32, 8, 40);
  private gold = new THREE.MeshBasicMaterial({ color: "#ffc93c", transparent: true, opacity: 0.95, depthWrite: false, fog: false });
  private faint = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.35, depthWrite: false });
  private course: SwingCourse | null = null;

  constructor(private scene: THREE.Scene, private reduceMotion = false) {
    const pg = new THREE.CylinderGeometry(0.35, 0.35, 1, 6, 1, true);
    pg.translate(0, 0.5, 0);
    this.pillar = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: "#ffc93c", transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
    this.group.add(this.pillar);
    this.group.visible = false;
    scene.add(this.group);
  }

  set(course: SwingCourse | null) {
    this.course = course;
    for (const m of this.rings) this.group.remove(m);
    this.rings = [];
    this.group.visible = !!course;
    if (!course) return;
    for (const r of course.rings) {
      const m = new THREE.Mesh(this.ringGeo, this.faint);
      m.position.set(r.x, r.y, r.z);
      m.rotation.y = r.yaw;
      m.frustumCulled = true;
      this.group.add(m);
      this.rings.push(m);
    }
  }

  update(t: number) {
    const c = this.course;
    if (!c) return;
    c.rings.forEach((r, i) => {
      const m = this.rings[i];
      if (!m) return;
      m.visible = !r.hit;
      const next = i === c.next;
      m.material = next ? this.gold : this.faint;
      m.scale.setScalar(next && !this.reduceMotion ? 1 + Math.sin(t * 5) * 0.06 : 1);
    });
    const n = c.rings[c.next];
    this.pillar.visible = !!n && !c.done;
    if (n) {
      this.pillar.position.set(n.x, 0, n.z);
      this.pillar.scale.set(1, Math.max(1, n.y - SWING_RING_R), 1);
    }
  }

  dispose() {
    this.set(null);
    this.scene.remove(this.group);
    this.ringGeo.dispose();
    this.gold.dispose();
    this.faint.dispose();
    this.pillar.geometry.dispose();
    (this.pillar.material as THREE.Material).dispose();
  }
}
