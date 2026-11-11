"use client";
// Admin → Car lab: every vehicle in the game exactly as players get it (drive/vehicles3d.ts
// makeVehicle, the real 3D models once they've loaded), to look at from any side, try paint,
// dirt, rain and night on, check what's wrong (carCheck.ts: parts inside out, the cabin poking
// out of the glass, floating wheels, too many triangles) and save a screenshot.
// Also drivable from a script (tests, Claude): window.__carLab — pick(key), set({...}),
// view(name), lineup(on), shot() → PNG data URL, check(key). Opens on a car with /admin?tab=cars&car=xantia.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { msg, t } from "@/lib/i18n";
import { PAINTS, VEHICLES, type VehicleKey } from "@/lib/vehicles";
import { CAR_MODELS } from "@/lib/carModels";
import type { FleetKey } from "@/lib/fleet";
import { makeVehicle, type VehicleModel } from "./drive/vehicles3d";
import { fleetParts } from "./drive/fleet3d";
import { hasRealModel, onCarModel, preloadCarModels } from "./drive/carModels";
import { checkCar, type CarCheck, type CarIssue } from "./drive/carCheck";
import { WORLD } from "./drive/world3d";
import { Button } from "./Button";

type Look = { paint: string; dirt: number; wet: number; night: boolean; clearcoat: boolean; driver: boolean; wire: boolean; steer: number; spin: boolean };
const VIEWS = { side: [5.5, 1.2, 0], front: [0.6, 1.3, -6], rear: [-0.6, 1.4, 6], rear3q: [4, 1.7, 4.5], top: [0.01, 8, 0.01], wheel: [2.4, 0.5, -1.6], low: [3.2, 0.25, 0] } as const;
type View = keyof typeof VIEWS;
const VIEW_LABEL: Record<View, string> = { side: msg("Side"), front: msg("Front"), rear: msg("Rear"), rear3q: msg("Rear ¾"), top: msg("Top"), wheel: msg("Wheel"), low: msg("Low") };
const ISSUE: Record<CarIssue["code"], string> = {
  insideOut: msg("Part {part} is inside out ({n}% faces right way) — drawn see-through"),
  cabinPokes: msg("Cabin pokes {n} cm out of the glass (through roof / pillars)"),
  floating: msg("Wheels float {n} cm above the ground"),
  sunk: msg("Wheels sink {n} cm into the ground"),
  heavy: msg("Heavy: {n} triangles near (slow on phones)"),
};
const issueText = (i: CarIssue) => t(ISSUE[i.code], { part: i.part ?? "", n: i.code === "heavy" ? i.value : i.code === "insideOut" ? Math.round(i.value * 100) : Math.round(i.value * 100) });

const KEYS = Object.keys(VEHICLES) as VehicleKey[];
const fleetOf = (k: VehicleKey) => VEHICLES[k].model as FleetKey | undefined;

export default function AdminCars() {
  const mount = useRef<HTMLDivElement>(null);
  const lab = useRef<{ renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera; controls: OrbitControls; holder: THREE.Group; sun: THREE.DirectionalLight; hemi: THREE.HemisphereLight; render: () => void } | null>(null);
  const [car, setCar] = useState<VehicleKey>(() => {
    const q = typeof location !== "undefined" ? new URLSearchParams(location.search).get("car") : null;
    return q && q in VEHICLES ? (q as VehicleKey) : "samand";
  });
  const [look, setLook] = useState<Look>({ paint: PAINTS[0], dirt: 0.15, wet: 0, night: false, clearcoat: true, driver: true, wire: false, steer: 0, spin: false });
  const [lineup, setLineup] = useState(false);
  const [arrived, setArrived] = useState(0);
  const [check, setCheck] = useState<CarCheck | null>(null);
  const models = useRef<VehicleModel[]>([]);

  // The stage: ground, sky light, sun, orbit camera.
  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const env = new THREE.Scene();
    env.add(new THREE.HemisphereLight("#dfe9ff", "#6f7562", 3));
    scene.environment = pmrem.fromScene(env).texture;
    const hemi = new THREE.HemisphereLight("#ffffff", "#7a8262", 1.1);
    const sun = new THREE.DirectionalLight("#fff3e0", 2.6);
    sun.position.set(6, 10, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 });
    scene.add(hemi, sun);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: "#5d5f60", roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);
    const camera = new THREE.PerspectiveCamera(40, el.clientWidth / el.clientHeight, 0.05, 400);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.maxPolarAngle = Math.PI / 2 - 0.01;
    const holder = new THREE.Group();
    scene.add(holder);
    let raf = 0;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
    });
    ro.observe(el);
    lab.current = { renderer, scene, camera, controls, holder, sun, hemi, render: () => renderer.render(scene, camera) };
    preloadCarModels((k) => fleetParts(k));
    const off = onCarModel(() => setArrived((n) => n + 1));
    return () => {
      off();
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      for (const m of models.current) m.dispose();
      models.current = [];
      pmrem.dispose();
      renderer.dispose();
      el.removeChild(renderer.domElement);
      lab.current = null;
    };
  }, []);

  // The car (or every car in a row), rebuilt when it, its paint or its finish changes.
  useEffect(() => {
    const L = lab.current;
    if (!L) return;
    for (const m of models.current) (L.holder.remove(m.group), m.dispose());
    const keys = lineup ? KEYS : [car];
    models.current = keys.map((k, i) => {
      const m = makeVehicle(k, look.paint, "real", { lights: true, shadows: true, clearcoat: look.clearcoat, seed: 0.37 });
      m.group.position.x = lineup ? (i - (keys.length - 1) / 2) * 3.4 : 0;
      m.group.traverse((o) => ((o as THREE.Mesh).isMesh && ((o as THREE.Mesh).castShadow = true)));
      L.holder.add(m.group);
      return m;
    });
    const f = fleetOf(car);
    setCheck(f ? checkCar(fleetParts(f)) : null);
  }, [car, look.paint, look.clearcoat, lineup, arrived]);

  // The rest is applied to what's there.
  useEffect(() => {
    const L = lab.current;
    if (!L) return;
    WORLD.wet.value = look.wet;
    L.sun.intensity = look.night ? 0.05 : 2.6;
    L.hemi.intensity = look.night ? 0.08 : 1.1;
    L.scene.environmentIntensity = look.night ? 0.12 : 1;
    L.scene.background = new THREE.Color(look.night ? "#0b1020" : "#bcd0e2");
    L.renderer.toneMappingExposure = look.night ? 1.4 : 0.9;
    L.controls.autoRotate = look.spin;
    for (const m of models.current) {
      if (m.grime) m.grime.dirt.value = look.dirt;
      if (m.driver) m.driver.visible = look.driver;
      if (m.light) m.light.visible = look.night;
      for (const s of m.steer) s.rotation.y = look.steer;
      m.group.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (mat && "wireframe" in mat) mat.wireframe = look.wire;
      });
    }
  }, [look, car, lineup, arrived]);

  const view = (v: View) => {
    const L = lab.current;
    if (!L) return;
    const [x, y, z] = VIEWS[v], far = lineup ? 4 : 1;
    L.camera.position.set(x * far, y * (lineup ? 2 : 1), z * far + (lineup ? 12 : 0));
    L.controls.target.set(0, v === "wheel" || v === "low" ? 0.4 : 0.7, v === "wheel" ? -1.3 : 0);
    L.controls.update();
  };
  useEffect(() => view(lineup ? "front" : "rear3q"), [lineup]); // eslint-disable-line react-hooks/exhaustive-deps

  const shot = () => {
    const L = lab.current;
    if (!L) return "";
    L.render();
    return L.renderer.domElement.toDataURL("image/png");
  };
  const download = () => {
    const a = document.createElement("a");
    a.href = shot();
    a.download = `car-${lineup ? "lineup" : car}-${Date.now()}.png`;
    a.click();
  };

  // For scripts (tests, Claude): the same controls.
  useEffect(() => {
    (window as unknown as { __carLab?: unknown }).__carLab = {
      keys: KEYS,
      pick: (k: VehicleKey) => (setLineup(false), setCar(k)),
      set: (o: Partial<Look>) => setLook((l) => ({ ...l, ...o })),
      view,
      lineup: (on: boolean) => setLineup(on),
      shot,
      check: (k: VehicleKey) => (fleetOf(k) ? checkCar(fleetParts(fleetOf(k)!)) : null),
      real: (k: VehicleKey) => (fleetOf(k) ? hasRealModel(fleetOf(k)!) : false),
    };
  });

  const f = fleetOf(car), model = f ? CAR_MODELS[f] : undefined, real = f ? hasRealModel(f) : false;
  return (
    <div className="carlab">
      <div className="carlab-cars">
        <Button className={`chip ${lineup ? "on" : ""}`} onClick={() => setLineup(!lineup)}>🚗🚙🚕 {t("All side by side")}</Button>
        {KEYS.map((k) => (
          <Button key={k} className={`chip ${!lineup && car === k ? "on" : ""}`} onClick={() => (setLineup(false), setCar(k))}>
            {VEHICLES[k].emoji} {t(VEHICLES[k].name)}
            {fleetOf(k) && CAR_MODELS[fleetOf(k)!] ? <span className="carlab-tag">3D</span> : null}
          </Button>
        ))}
      </div>
      <div className="carlab-stage" ref={mount} />
      <div className="carlab-bar row wrap">
        {(Object.keys(VIEWS) as View[]).map((v) => (
          <Button key={v} className="btn small ghost" onClick={() => view(v)}>{t(VIEW_LABEL[v])}</Button>
        ))}
        <Button className="btn small yellow" onClick={download}>📸 {t("Screenshot")}</Button>
      </div>
      <div className="carlab-grid">
        <div className="card">
          <b>{t("Try it out")}</b>
          <div className="row wrap" style={{ gap: 6, margin: "8px 0" }}>
            {PAINTS.map((c) => (
              <button key={c} type="button" className={`carlab-swatch ${look.paint === c ? "on" : ""}`} style={{ background: c }} onClick={() => setLook({ ...look, paint: c })} aria-label={c} />
            ))}
            <input type="color" value={look.paint} onChange={(e) => setLook({ ...look, paint: e.target.value })} aria-label={t("Paint")} />
          </div>
          <label className="carlab-range">{t("Dirt")} <input type="range" min={0} max={0.85} step={0.01} value={look.dirt} onChange={(e) => setLook({ ...look, dirt: +e.target.value })} /></label>
          <label className="carlab-range">{t("Rain on the paint")} <input type="range" min={0} max={1} step={0.01} value={look.wet} onChange={(e) => setLook({ ...look, wet: +e.target.value })} /></label>
          <label className="carlab-range">{t("Steering")} <input type="range" min={-0.6} max={0.6} step={0.01} value={look.steer} onChange={(e) => setLook({ ...look, steer: +e.target.value })} /></label>
          <div className="row wrap" style={{ gap: 10, marginTop: 6 }}>
            {(
              [
                ["night", msg("Night (headlights)")],
                ["clearcoat", msg("Clear coat (high/ultra)")],
                ["driver", msg("Driver and cabin")],
                ["wire", msg("Wireframe")],
                ["spin", msg("Turn round")],
              ] as const
            ).map(([k, label]) => (
              <label key={k} className="small">
                <input type="checkbox" checked={look[k]} onChange={(e) => setLook({ ...look, [k]: e.target.checked })} /> {t(label)}
              </label>
            ))}
          </div>
        </div>
        <div className="card">
          <b>{t("Check")}</b>
          {!f ? (
            <p className="small muted">{t("Drawn in code (no 3D model file) — nothing to check.")}</p>
          ) : (
            <>
              <p className="small">
                {real ? t("✅ Real 3D model") : model ? t("⏳ Real model loading — showing the drawn one") : t("Drawn in code (no 3D model file)")}
                {model && ` · ${Math.round(model.bytes / 1024)} KB · ${model.credit.title} — ${model.credit.author} (${model.credit.license})`}
              </p>
              {check && (
                <>
                  <p className="small muted">
                    {t("{n} triangles near, {f} far", { n: Math.round(check.tris), f: Math.round(check.farTris) })} · {t("cabin poke {n} cm", { n: Math.round(check.cabinPoke * 100) })} · {t("wheel gap {n} cm", { n: Math.round(check.wheelGap * 100) })}
                  </p>
                  <table className="carlab-parts small">
                    <tbody>
                      {check.parts.map((p) => (
                        <tr key={p.name} className={p.winding < 0.5 ? "bad" : ""}>
                          <td>{p.name}</td>
                          <td>{Math.round(p.tris)}</td>
                          <td>{t("{n}% faces right way", { n: Math.round(p.winding * 100) })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {check.issues.length ? (
                    <ul className="carlab-issues small">{check.issues.map((i, n) => <li key={n}>⚠️ {issueText(i)}</li>)}</ul>
                  ) : (
                    <p className="small" style={{ color: "var(--green)" }}>{t("✅ No problems found")}</p>
                  )}
                  <p className="small muted">{t("Parts found inside out are turned right way round when the game loads them.")}</p>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
