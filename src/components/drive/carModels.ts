"use client";
// The street cars made from real 3D models (scripts/cars.ts builds them; lib/carModels.ts
// lists them). They replace the drawn-from-code models of fleet3d.ts once they've arrived:
//  - lazy: a model is fetched the first time a car of that kind is asked for (or by
//    preloadCarModels when drive mode opens, when the phone is idle) — until then traffic
//    shows the drawn one, so nothing ever waits on the network;
//  - one fetch per file however many ask (the taxi shares the Samand's), and a failed one
//    is simply not retried this session (the drawn car stays);
//  - the file's address carries its hash, so the browser and the service worker keep it
//    for good (cache-first) and only a rebuilt car is downloaded again;
//  - each file holds the six parts traffic instances, near and far ("paint", "paint_far",
//    …), quantized and meshopt-compressed; they're unpacked to plain float geometry once
//    and shared by every car of that kind (and the player's own).
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { CAR_MODELS } from "@/lib/carModels";
import { FLEET, type FleetKey } from "@/lib/fleet";
import type { FleetParts } from "./fleet3d";
import { loadModel } from "./gltf";
import { paint as tint } from "./world3d";

/** Kinds drawn from another kind's model: the city taxi is a yellow Samand with its roof sign. */
const BASED_ON: Partial<Record<FleetKey, FleetKey>> = { taxi: "samand" };

type Meta = {
  wheelR: number;
  wheels: { x: number; y: number; z: number; steers: boolean }[];
  lamp: { y: number; z: number };
  roof: { y: number; z: number };
};

const ready = new Map<FleetKey, FleetParts>();
const files = new Map<string, Promise<{ root: THREE.Object3D; meta: Meta } | null>>();
const asked = new Set<FleetKey>();
const listeners = new Set<(key: FleetKey) => void>();

/** Which file a kind of vehicle comes from, if any. */
const sourceOf = (key: FleetKey) => CAR_MODELS[BASED_ON[key] ?? key]?.file ?? null;

/** The real model of this kind if it has arrived; asks for it (once) if not. */
export function carModel(key: FleetKey, fallback: () => FleetParts): FleetParts | null {
  const got = ready.get(key);
  if (got) return got;
  if (!asked.has(key) && sourceOf(key)) {
    asked.add(key);
    void load(key, fallback);
  }
  return null;
}

/** Called with a kind once its real model is in (to rebuild a player's car that was drawn before it came). */
export function onCarModel(fn: (key: FleetKey) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Fetch every car model in the background, one at a time, when the phone has nothing better to do. */
export function preloadCarModels(fallback: (key: FleetKey) => FleetParts) {
  const keys = (Object.keys(FLEET) as FleetKey[]).filter((k) => sourceOf(k) && !asked.has(k));
  const idle = (fn: () => void) => ("requestIdleCallback" in window ? window.requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 300));
  const next = () => {
    const k = keys.shift();
    if (!k) return;
    if (asked.has(k)) return next();
    asked.add(k);
    void load(k, () => fallback(k)).then(() => idle(next));
  };
  idle(next);
}

function fetchFile(url: string) {
  let p = files.get(url);
  if (!p) {
    p = loadModel(url)
      .then((root) => ({ root, meta: root.userData as Meta }))
      .catch((e) => {
        console.warn("car model", url, e);
        return null;
      });
    files.set(url, p);
  }
  return p;
}

async function load(key: FleetKey, fallback: () => FleetParts) {
  const file = await fetchFile(sourceOf(key)!);
  if (!file?.meta?.wheels?.length) return;
  const drawn = fallback();
  const near = toParts(key, file.root, file.meta, "", drawn);
  if (!near) return;
  near.far = toParts(key, file.root, file.meta, "_far", drawn) ?? undefined;
  ready.set(key, near);
  for (const fn of listeners) fn(key);
}

/** One level of detail: the parts as plain float geometry, in the car's frame. */
function toParts(key: FleetKey, root: THREE.Object3D, meta: Meta, suffix: string, drawn: FleetParts): FleetParts | null {
  root.updateMatrixWorld(true);
  const part = (name: string) => {
    const m = root.getObjectByName(name + suffix) as THREE.Mesh | undefined;
    return m?.isMesh ? unpack(m) : null;
  };
  const paint = part("paint"), kit = part("kit"), head = part("head"), tail = part("tail"), wheel = part("wheel");
  if (!paint || !kit || !head || !tail || !wheel) return null;
  const { len, wid, hgt } = FLEET[key];
  const isTaxi = key === "taxi";
  return {
    key,
    len,
    wid,
    hgt,
    paint,
    kit: isTaxi ? withSign(kit, meta.roof) : kit,
    glass: part("glass"),
    head,
    tail,
    wheel,
    wheelR: meta.wheelR,
    // The model's wheel is a left one: the right ones are it turned round.
    wheels: meta.wheels.map((w) => ({ ...w, flip: w.x > 0 })),
    lamp: meta.lamp,
    // A parcel rides on the roof — in the bed of a pickup, where the drawn model knows.
    cargo: key === "vanet" ? drawn.cargo.clone() : new THREE.Vector3(0, meta.roof.y + 0.25, meta.roof.z),
  };
}

/** Quantized, compressed attributes → plain floats with the node's transform applied (once, at load). */
function unpack(m: THREE.Mesh) {
  const src = m.geometry;
  const g = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "color"]) {
    const a = src.getAttribute(name);
    if (!a) continue;
    const out = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) out.set([a.getX(i), a.getY(i), a.getZ(i)], i * 3);
    g.setAttribute(name, new THREE.BufferAttribute(out, 3));
  }
  if (src.index) g.setIndex(new THREE.BufferAttribute(src.index.array.slice(), 1));
  g.applyMatrix4(m.matrixWorld);
  g.computeBoundingSphere();
  src.dispose();
  return g;
}

/** The taxi's roof sign (as the drawn taxi has it), on the model's roof. */
function withSign(kit: THREE.BufferGeometry, roof: Meta["roof"]) {
  const box = (w: number, h: number, d: number, y: number, c: string) => tint(new THREE.BoxGeometry(w, h, d).translate(0, roof.y + y, roof.z), c);
  const signs = [box(0.62, 0.05, 0.3, 0.02, "#1c1d20"), box(0.54, 0.16, 0.2, 0.125, "#f6f4ea"), box(0.546, 0.04, 0.206, 0.095, "#1b1b1b")];
  const k = kit.index ? kit.toNonIndexed() : kit;
  return mergeGeometries([k, ...signs])!;
}
