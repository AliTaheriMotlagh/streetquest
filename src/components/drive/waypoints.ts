"use client";
// HUD waypoints over the 3D view: for the destination and the nearest few jobs, a badge in the
// same icon language as the markers with its distance (tabular figures) while it is on screen,
// and a screen-edge arrow pointing the way when it is not. A fixed pool of DOM nodes; frame()
// only writes transforms and (when the rounded distance changes) one text node.
import * as THREE from "three";
import { ICON_PATHS, type IconName } from "@/lib/iconPaths";
import { edgeArrow, type EdgeResult } from "@/lib/hudMarkers";

type Slot = {
  el: HTMLDivElement; svg: SVGPathElement; arrow: HTMLElement; dist: HTMLElement;
  on: boolean; edge: boolean; icon: IconName | ""; color: string; q: number; label: string;
  x: number; y: number; z: number;
};

export class Waypoints {
  private slots: Slot[] = [];
  private used = 0;
  private v = new THREE.Vector3();
  private out: EdgeResult = { x: 0, y: 0, angle: 0, edge: false };
  hidden = false;

  constructor(private root: HTMLElement, count: number, private fmt: (m: number) => string, private margin = 34) {
    for (let i = 0; i < count; i++) this.slots.push(this.build());
  }

  private build(): Slot {
    const el = document.createElement("div");
    el.className = "wp";
    el.hidden = true;
    el.innerHTML = '<i class="wp-arr"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l9 7-9 7z"/></svg></i><span class="wp-ic"><svg viewBox="0 0 24 24" aria-hidden="true"><path/></svg></span><b class="wp-d"></b>';
    this.root.appendChild(el);
    return { el, svg: el.querySelector(".wp-ic path")!, arrow: el.querySelector(".wp-arr")!, dist: el.querySelector(".wp-d")!, on: false, edge: false, icon: "", color: "", q: -1, label: "", x: 0, y: 0, z: 0 };
  }

  /** Slow-tick: what to point at (the first `count` are used). Position, not objects, so a pooled mesh can move. */
  begin() {
    this.used = 0;
  }
  add(x: number, y: number, z: number, icon: IconName, color: string, label: string) {
    if (this.used >= this.slots.length) return;
    const s = this.slots[this.used++];
    (s.x = x), (s.y = y), (s.z = z), (s.on = true);
    if (s.icon !== icon) (s.icon = icon), s.svg.setAttribute("d", ICON_PATHS[icon]);
    if (s.color !== color) (s.color = color), s.el.style.setProperty("--wp", color);
    s.label = label;
  }
  end() {
    for (let i = this.used; i < this.slots.length; i++) if (this.slots[i].on) (this.slots[i].on = false), (this.slots[i].el.hidden = true);
  }

  /** Each frame: project and place. `w`, `h` are the view's size in CSS px. */
  frame(camera: THREE.Camera, w: number, h: number, px: number, pz: number) {
    for (let i = 0; i < this.used; i++) {
      const s = this.slots[i];
      if (this.hidden) {
        s.el.hidden = true;
        continue;
      }
      this.v.set(s.x, s.y, s.z).applyMatrix4(camera.matrixWorldInverse);
      const behind = this.v.z > 0; // view space looks down -z
      this.v.applyMatrix4(camera.projectionMatrix);
      const r = edgeArrow(this.v.x, this.v.y, behind, w, h, this.margin, this.out);
      s.el.hidden = false;
      s.el.style.transform = `translate3d(${r.x.toFixed(1)}px,${r.y.toFixed(1)}px,0)`;
      if (r.edge !== s.edge) (s.edge = r.edge), s.el.classList.toggle("edge", r.edge);
      if (r.edge) s.arrow.style.transform = `rotate(${r.angle.toFixed(3)}rad) translateX(26px)`;
      const d = Math.hypot(s.x - px, s.z - pz);
      const q = d < 1000 ? Math.round(d / 5) : 1e6 + Math.round(d / 100);
      if (q !== s.q) (s.q = q), (s.dist.textContent = this.fmt(d));
    }
  }

  dispose() {
    for (const s of this.slots) s.el.remove();
    this.slots.length = 0;
  }
}
