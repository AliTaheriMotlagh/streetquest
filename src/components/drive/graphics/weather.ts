"use client";
// Rain: thin streaks falling through a box that travels with the camera, one instanced draw
// call. The GPU moves every drop (position = seed + velocity × time, wrapped into the box),
// so the CPU does nothing per frame but set three uniforms.
import * as THREE from "three";
import { prng } from "./surfaces";

const BOX = new THREE.Vector3(46, 26, 46);

export class Rain {
  readonly mesh: THREE.Mesh;
  private mat: THREE.ShaderMaterial;
  private geo: THREE.InstancedBufferGeometry;

  constructor(count: number) {
    const quad = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
    this.geo = new THREE.InstancedBufferGeometry();
    this.geo.index = quad.index;
    this.geo.setAttribute("position", quad.getAttribute("position"));
    const seeds = new Float32Array(count * 4);
    const r = prng(42);
    for (let i = 0; i < count; i++) seeds.set([r(), r(), r(), 0.75 + r() * 0.5], i * 4);
    this.geo.setAttribute("seed", new THREE.InstancedBufferAttribute(seeds, 4));
    this.geo.instanceCount = count;
    quad.dispose();
    this.mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      side: THREE.DoubleSide, // billboards: which face points at the camera depends on the drop
      uniforms: { uCam: { value: new THREE.Vector3() }, uTime: { value: 0 }, uBox: { value: BOX }, uFall: { value: new THREE.Vector3(1.2, -11, 0.6) }, uAmount: { value: 0 }, uColor: { value: new THREE.Color("#c9d3dd") } },
      vertexShader: /* glsl */ `
        attribute vec4 seed; uniform vec3 uCam; uniform float uTime; uniform vec3 uBox; uniform vec3 uFall; uniform float uAmount;
        varying float vA;
        void main() {
          // Drop i: wrap its fall into the box around the camera.
          vec3 p = seed.xyz * uBox + uFall * seed.w * uTime;
          p = mod(p - uCam + uBox * 0.5, uBox) + uCam - uBox * 0.5;
          vec3 dir = normalize(uFall);
          vec3 view = normalize(cameraPosition - p);
          vec3 side = normalize(cross(dir, view));
          float len = 0.75 * seed.w;
          vec3 w = p - dir * len * position.y + side * position.x * 0.028;
          float dist = distance(p, cameraPosition);
          // Fade at the box edges and right in front of the lens; thinner drops when there's less rain.
          vA = (1.0 - smoothstep(uBox.x * 0.3, uBox.x * 0.5, distance(p.xz, uCam.xz))) * smoothstep(0.8, 2.5, dist) * step(fract(seed.x * 13.7), uAmount) * position.y;
          gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vA;
        void main() {
          gl_FragColor = vec4(uColor, 0.5 * vA);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.visible = false;
  }

  /** `amount` 0–1 (0 hides it); `light` tints the streaks with the sky (dark at night). */
  update(cam: THREE.Vector3, time: number, amount: number, light: THREE.Color) {
    this.mesh.visible = amount > 0.01;
    if (!this.mesh.visible) return;
    const u = this.mat.uniforms;
    u.uCam.value.copy(cam);
    u.uTime.value = time % 10_000;
    u.uAmount.value = amount;
    u.uColor.value.copy(light);
  }

  dispose() {
    this.geo.dispose();
    this.mat.dispose();
  }
}
