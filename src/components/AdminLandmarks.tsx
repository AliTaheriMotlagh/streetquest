"use client";
// Admin → 3D stores: give a paying store its own building in the drive city.
// 1. pick the store (its pin is where the model stands); 2. look at the spot (street
// photos, satellite); 3. download its real footprint and the Blender starter script;
// 4. upload the .glb — the preview shows it on the real footprint with the neighbours
// and streets around, and checks it against the phone budget; 5. save.
// Loaded only in the browser (three.js, Leaflet), from AdminPanel.
import { useCallback, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { askConfirm } from "@/components/Dialogs";
import { Button } from "@/components/Button";
import AdminDropMap from "@/components/AdminDropMap";
import { disposeModel, loadModel, measure } from "@/components/drive/gltf";
import { footprintAt, footprintObj, type Footprint } from "@/components/drive/footprint";
import { BUDGET, BUDGET_LABEL, LANDMARK_LIMITS, LANDMARK_MAX_BYTES, type ModelStats } from "@/lib/landmarks";
import { PLAN_BY_KEY, type PlanKey } from "@/lib/business";
import { fmtNum, t } from "@/lib/i18n";

const planName = (k: string) => t(PLAN_BY_KEY[k as PlanKey]?.name ?? k);

type Row = {
  id: string; name: string; businessId: string | null; emoji: string; lat: number; lng: number; yaw: number; scale: number; lift: number; url: string | null;
  active: boolean; paidOnly: boolean; modelSize: number; stats: Partial<ModelStats>; showing: boolean; updatedAt: string;
  business: { id: string; name: string; plan: string; verified: boolean } | null;
};
type Biz = { id: string; name: string; emoji: string; lat: number; lng: number; address: string; verified: boolean; plan: string };
type Draft = { id?: string; name: string; businessId: string | null; lat: number; lng: number; yaw: number; scale: number; lift: number; active: boolean; paidOnly: boolean; url: string | null };
type Measured = { stats: ModelStats; hull: number[]; height: number };

const M_LAT = 110_540;
const mLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

/** Where to look at the real store before modelling it. */
const photoLinks = (lat: number, lng: number) => [
  { label: t("Street View"), href: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}` },
  { label: t("Satellite"), href: `https://www.google.com/maps/@${lat},${lng},70m/data=!3m1!1e3` },
  { label: t("Mapillary photos"), href: `https://www.mapillary.com/app/?lat=${lat}&lng=${lng}&z=19` },
  { label: t("Footprint on OpenStreetMap"), href: `https://www.openstreetmap.org/#map=20/${lat}/${lng}` },
];

const status = (k: keyof typeof BUDGET, v: number) => (v > BUDGET[k].max ? "over" : v > BUDGET[k].warn ? "warn" : "ok");
const showValue = (k: keyof typeof BUDGET, v: number) => (k === "bytes" ? `${(v / 1024 / 1024).toFixed(2)} MB` : fmtNum(v));

function download(name: string, text: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export default function AdminLandmarks({ onError }: { onError: (m: string | null) => void }) {
  const [data, setData] = useState<{ landmarks: Row[]; businesses: Biz[] } | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [file, setFile] = useState<{ name: string; buf: ArrayBuffer } | null>(null);
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [measured, setMeasured] = useState<Measured | null>(null);
  const [fp, setFp] = useState<Footprint | null>(null);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    fetch("/api/admin/landmarks")
      .then((r) => r.json())
      .then((d) => (d.error ? onError(d.error) : setData(d)));
  }, [onError]);
  useEffect(load, [load]);

  // The real footprint under the pin, for the preview (and the Blender download).
  useEffect(() => {
    if (!draft) return setFp(null);
    let gone = false;
    const timer = setTimeout(() => footprintAt(draft.lat, draft.lng).then((f) => !gone && setFp(f)).catch(() => !gone && setFp(null)), 300);
    return () => ((gone = true), clearTimeout(timer));
  }, [draft?.lat, draft?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // A landmark being edited shows its current model until a new file is picked.
  useEffect(() => {
    if (!draft?.url || file) return;
    let gone = false;
    loadModel(draft.url)
      .then((m) => (gone ? disposeModel(m) : setModel(m)))
      .catch(() => {});
    return () => {
      gone = true;
    };
  }, [draft?.url, file]);
  useEffect(() => () => void (model && disposeModel(model)), [model]);

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    onError(null);
    if (f.size > LANDMARK_MAX_BYTES) return onError(t("The model is too large — keep it under 4 MB (Draco compression and WebP textures help)"));
    const buf = await f.arrayBuffer();
    try {
      const m = await loadModel(buf.slice(0));
      setMeasured(measure(m, f.size));
      setModel(m);
      setFile({ name: f.name, buf });
    } catch (e) {
      onError(t("That file isn't a .glb model — export as glTF Binary (.glb)") + ` (${(e as Error).message})`);
    }
  };

  const edit = (r: Row | null) => {
    setFile(null);
    setMeasured(null);
    setModel(null);
    if (r) setDraft({ id: r.id, name: r.name, businessId: r.businessId, lat: r.lat, lng: r.lng, yaw: r.yaw, scale: r.scale, lift: r.lift, active: r.active, paidOnly: r.paidOnly, url: r.url });
    else {
      const b = data?.businesses[0];
      setDraft({ name: b?.name ?? "", businessId: b?.id ?? null, lat: b?.lat ?? 35.6997, lng: b?.lng ?? 51.338, yaw: 0, scale: 1, lift: 0, active: true, paidOnly: true, url: null });
    }
  };

  const cancel = () => {
    setDraft(null);
    setFile(null);
    setMeasured(null);
    setModel(null);
  };

  const nudge = (northM: number, eastM: number) => draft && setDraft({ ...draft, lat: draft.lat + northM / M_LAT, lng: draft.lng + eastM / mLng(draft.lat) });

  const save = async () => {
    if (!draft) return;
    setBusy("save");
    onError(null);
    try {
      const { url: _u, ...fields } = draft;
      const r = await fetch("/api/admin/landmarks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "save", ...fields }) });
      const d = await r.json();
      if (!r.ok) return onError(d.error ?? t("Request failed"));
      if (file && measured) {
        const form = new FormData();
        form.append("model", new Blob([file.buf], { type: "model/gltf-binary" }), file.name);
        form.append("meta", JSON.stringify(measured));
        const up = await fetch(`/api/admin/landmarks?id=${d.id}`, { method: "PUT", body: form });
        const u = await up.json();
        if (!up.ok) return onError(u.error ?? t("Request failed"));
      }
      cancel();
      load();
    } finally {
      setBusy("");
    }
  };

  const remove = (r: Row) =>
    askConfirm(t("Delete the 3D building of {name}?", { name: r.name }), { body: t("The map's own building comes back in drive mode."), ok: t("Delete"), danger: true }).then(async (ok) => {
      if (!ok) return;
      await fetch("/api/admin/landmarks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", id: r.id }) });
      load();
    });

  if (!data) return <p>{t("Loading…")}</p>;
  const biz = draft?.businessId ? data.businesses.find((b) => b.id === draft.businessId) : null;
  const over = measured ? (Object.keys(BUDGET) as (keyof typeof BUDGET)[]).some((k) => status(k, measured.stats[k]) === "over") : false;

  return (
    <>
      <div className="card">
        <div className="row">
          <b className="grow">{t("3D stores in the city")}</b>
          <Button className="btn green small" onClick={() => edit(null)}>＋ {t("New 3D store")}</Button>
        </div>
        <div className="table-scroll" style={{ marginTop: 8 }}>
          <table>
            <thead><tr><th>{t("Store")}</th><th>{t("Plan")}</th><th>{t("Where")}</th><th>{t("Model")}</th><th>{t("In the game")}</th><th /></tr></thead>
            <tbody>
              {data.landmarks.map((r) => (
                <tr key={r.id} style={{ opacity: r.showing ? 1 : 0.6 }}>
                  <td><b>{r.emoji} {r.name}</b>{r.business && r.business.name !== r.name && <div className="small muted">{r.business.name}</div>}</td>
                  <td><span className="tag">{r.business ? planName(r.business.plan) : "—"}</span></td>
                  <td className="mono small" dir="ltr">{r.lat.toFixed(5)}, {r.lng.toFixed(5)}</td>
                  <td className="small">{r.url ? `${fmtNum(r.stats.triangles ?? 0)} ${t("triangles")} · ${(r.modelSize / 1024 / 1024).toFixed(2)} MB` : <span className="muted">{t("No model yet")}</span>}</td>
                  <td className="small">{r.showing ? `✅ ${t("Showing")}` : !r.active ? t("Switched off") : !r.url ? t("Waiting for a model") : t("Hidden until the store pays")}</td>
                  <td className="row">
                    <Button className="btn ghost small" onClick={() => edit(r)}>{t("Edit")}</Button>
                    <Button className="btn ghost small" onClick={() => remove(r)}>{t("Delete")}</Button>
                  </td>
                </tr>
              ))}
              {!data.landmarks.length && <tr><td colSpan={6} className="muted small">{t("No 3D stores yet — pick a paying store and give it its real building.")}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {draft && (
        <div className="card lm-editor">
          <b>{draft.id ? t("Edit 3D store") : t("New 3D store")}</b>
          <div className="form-grid">
            <div>
              <label>{t("Store")}</label>
              <select
                value={draft.businessId ?? ""}
                onChange={(e) => {
                  const b = data.businesses.find((x) => x.id === e.target.value);
                  setDraft({ ...draft, businessId: b?.id ?? null, ...(b ? { name: b.name, lat: b.lat, lng: b.lng } : {}) });
                }}
              >
                <option value="">{t("No store (a landmark)")}</option>
                {data.businesses.map((b) => (
                  <option key={b.id} value={b.id}>{b.emoji} {b.name} · {planName(b.plan)}{b.verified ? " ✓" : ""}</option>
                ))}
              </select>
            </div>
            <div><label>{t("Name in the game")}</label><input value={draft.name} maxLength={LANDMARK_LIMITS.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></div>
          </div>
          {biz && biz.plan === "free" && <p className="small" style={{ color: "var(--yellow)" }}>{t("This store is on the Free plan: with “only while paid” on, players won't see the building until it upgrades.")}</p>}

          <h4>{t("1 · Where it stands")}</h4>
          <p className="small muted">{t("Tap the map on the store's front door. The model's origin goes exactly here.")}</p>
          <AdminDropMap points={[{ lat: draft.lat, lng: draft.lng }]} center={{ lat: draft.lat, lng: draft.lng }} existing={data.landmarks.filter((r) => r.id !== draft.id).map((r) => ({ points: [{ lat: r.lat, lng: r.lng }], active: r.showing }))} onPick={(p) => setDraft({ ...draft, lat: p.lat, lng: p.lng })} />
          <div className="row wrap" style={{ marginTop: 8 }}>
            <span className="mono small grow" dir="ltr">{draft.lat.toFixed(6)}, {draft.lng.toFixed(6)}</span>
            <span className="small muted">{t("Nudge 0.5 m:")}</span>
            <Button className="btn ghost small" onClick={() => nudge(0.5, 0)} aria-label={t("North")}>↑</Button>
            <Button className="btn ghost small" onClick={() => nudge(-0.5, 0)} aria-label={t("South")}>↓</Button>
            <Button className="btn ghost small" onClick={() => nudge(0, -0.5)} aria-label={t("West")}>←</Button>
            <Button className="btn ghost small" onClick={() => nudge(0, 0.5)} aria-label={t("East")}>→</Button>
          </div>

          <h4>{t("2 · Look at the real store")}</h4>
          <div className="row wrap">
            {photoLinks(draft.lat, draft.lng).map((l) => (
              <a key={l.href} className="btn ghost small" href={l.href} target="_blank" rel="noreferrer">{l.label} ↗</a>
            ))}
          </div>
          <p className="small muted">{t("Use the photos as a reference for shape, colours and the sign. For textures, use the store's own photos and logo files — street-view images belong to their owners.")}</p>

          <h4>{t("3 · Model it in Blender")}</h4>
          <div className="row wrap">
            <Button className="btn cyan small" disabled={!fp?.target} onClick={() => fp && download(`${(draft.name || "store").replace(/[^\p{L}\p{N}]+/gu, "_")}_footprint.obj`, footprintObj(fp, draft.name))}>
              ⬇ {t("Footprint for Blender (.obj)")}
            </Button>
            <a className="btn ghost small" href="/tools/streetquest_store.py" download>⬇ {t("Blender starter script")}</a>
            <span className="small muted">
              {fp === null ? t("Reading the map…") : fp.target ? t("Map building: {h} m tall, {n} neighbours, {r} streets", { h: fmtNum(fp.target.h), n: fp.neighbours.length, r: fp.roads.length }) : t("No building on the map within 25 m of the pin")}
            </span>
          </div>
          <details className="small muted" style={{ marginTop: 6 }}>
            <summary>{t("How to make it (5 steps)")}</summary>
            <ol style={{ lineHeight: 1.6, paddingInlineStart: 18 }}>
              <li>{t("Blender → File → Import → Wavefront (.obj), default settings. The gold ref_footprint is the real building at real size; top view is the map, +Y is north, the origin is the pin.")}</li>
              <li>{t("Quick start: Scripting tab → open streetquest_store.py → set the name and colour → Run. It builds a storefront on the footprint and exports store.glb next to your .blend.")}</li>
              <li>{t("Make it look like the photos. 1 unit = 1 metre; keep it on the footprint and at the origin. Principled BSDF materials only; give the sign an Emission so it glows at night.")}</li>
              <li>{t("Stay light for phones: under 60,000 triangles, textures 1024–2048 px, under 12 materials. Apply modifiers.")}</li>
              <li>{t("File → Export → glTF 2.0: format glTF Binary (.glb), +Y up, Apply Modifiers, Compression (Draco) on, images WebP. Then upload it here.")}</li>
            </ol>
          </details>

          <h4>{t("4 · Upload and check")}</h4>
          <input type="file" accept=".glb,model/gltf-binary" onChange={(e) => pickFile(e.target.files?.[0])} />
          <LandmarkPreview fp={fp} model={model} yaw={draft.yaw} scale={draft.scale} lift={draft.lift} />
          {measured && (
            <div className="lm-budget">
              {(Object.keys(BUDGET) as (keyof typeof BUDGET)[]).map((k) => (
                <div key={k} className={`stat ${status(k, measured.stats[k])}`}>
                  <b>{showValue(k, measured.stats[k])}</b>
                  <span>{t(BUDGET_LABEL[k])}</span>
                </div>
              ))}
            </div>
          )}
          {measured && <p className="small muted">{over ? t("Over the limit for phones — simplify it (Decimate modifier, smaller textures) and export again.") : t("Street-level outline: {n} points, {h} m tall. Cars bump into this outline.", { n: measured.hull.length / 2, h: fmtNum(measured.height) })}</p>}
          <div className="form-grid">
            <div><label>{t("Turn (degrees, clockwise)")}</label><input type="range" min={-180} max={180} step={0.5} value={draft.yaw > 180 ? draft.yaw - 360 : draft.yaw} onChange={(e) => setDraft({ ...draft, yaw: Number(e.target.value) })} /><span className="small mono">{draft.yaw.toFixed(1)}°</span></div>
            <div><label>{t("Scale")}</label><input type="number" min={0.05} max={20} step={0.01} value={draft.scale} onChange={(e) => setDraft({ ...draft, scale: Number(e.target.value) || 1 })} /></div>
            <div><label>{t("Up / down (m)")}</label><input type="number" min={-30} max={30} step={0.05} value={draft.lift} onChange={(e) => setDraft({ ...draft, lift: Number(e.target.value) || 0 })} /></div>
          </div>
          <p className="small muted">{t("A model made on the downloaded footprint needs no turning or scaling: leave 0°, 1 and 0.")}</p>

          <div className="row wrap" style={{ marginTop: 8 }}>
            <Button className={`toggle ${draft.active ? "on" : ""}`} onClick={() => setDraft({ ...draft, active: !draft.active })} aria-pressed={draft.active}><i /><span>{t("Show in drive mode")}</span></Button>
            <Button className={`toggle ${draft.paidOnly ? "on" : ""}`} onClick={() => setDraft({ ...draft, paidOnly: !draft.paidOnly })} aria-pressed={draft.paidOnly}><i /><span>{t("Only while the store's plan is paid")}</span></Button>
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <Button className="btn green" disabled={!!busy || draft.name.trim().length < 2 || over || (!draft.url && !file)} onClick={save}>{busy ? t("Saving…") : t("Save 3D store")}</Button>
            <Button className="btn ghost" onClick={cancel}>{t("Cancel")}</Button>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * The model on the real footprint: neighbours as grey blocks, streets dark, the target
 * footprint outlined in gold — what lines up here lines up in the game.
 */
function LandmarkPreview({ fp, model, yaw, scale, lift }: { fp: Footprint | null; model: THREE.Group | null; yaw: number; scale: number; lift: number }) {
  const mount = useRef<HTMLDivElement>(null);
  const three = useRef<{ scene: THREE.Scene; holder: THREE.Group; ref: THREE.Group; render: () => void } | null>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(2, devicePixelRatio));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.8;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#c3d2df");
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(new THREE.HemisphereLight("#dfe9ff", "#7a8262", 3));
    scene.environment = pmrem.fromScene(envScene).texture;
    scene.add(new THREE.HemisphereLight("#ffffff", "#7a8262", 1.2));
    const sun = new THREE.DirectionalLight("#fff3e0", 2.5);
    sun.position.set(40, 80, 30);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: "#868b7a", roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const camera = new THREE.PerspectiveCamera(50, el.clientWidth / el.clientHeight, 0.3, 1000);
    camera.position.set(28, 26, 34);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 4, 0);
    controls.maxPolarAngle = Math.PI / 2 - 0.02;
    const holder = new THREE.Group();
    const ref = new THREE.Group();
    scene.add(holder, ref);
    let raf = 0;
    const render = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => renderer.render(scene, camera));
    };
    controls.addEventListener("change", render);
    const ro = new ResizeObserver(() => {
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      render();
    });
    ro.observe(el);
    three.current = { scene, holder, ref, render };
    render();
    return () => {
      ro.disconnect();
      controls.dispose();
      cancelAnimationFrame(raf);
      pmrem.dispose();
      ref.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
      renderer.dispose();
      el.removeChild(renderer.domElement);
      three.current = null;
    };
  }, []);

  // The map around the pin.
  useEffect(() => {
    const T = three.current;
    if (!T) return;
    T.ref.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    T.ref.clear();
    if (fp) {
      const block = new THREE.MeshStandardMaterial({ color: "#b9b4aa", roughness: 0.9, transparent: true, opacity: 0.55 });
      const asphalt = new THREE.MeshStandardMaterial({ color: "#3a3d43", roughness: 0.95 });
      const shape = (pts: number[]) => new THREE.Shape(Array.from({ length: pts.length / 2 }, (_, i) => new THREE.Vector2(pts[i * 2], -pts[i * 2 + 1])));
      for (const b of fp.neighbours) {
        const g = new THREE.ExtrudeGeometry(shape(b.pts), { depth: b.h - b.mh, bevelEnabled: false });
        g.rotateX(-Math.PI / 2);
        g.translate(0, b.mh, 0);
        T.ref.add(new THREE.Mesh(g, block));
      }
      for (const r of fp.roads)
        for (let i = 0; i + 3 < r.pts.length; i += 2) {
          const ax = r.pts[i], az = r.pts[i + 1], bx = r.pts[i + 2], bz = r.pts[i + 3], len = Math.hypot(bx - ax, bz - az);
          const g = new THREE.PlaneGeometry(len + r.w * 0.5, r.w);
          g.rotateX(-Math.PI / 2);
          g.rotateY(-Math.atan2(bz - az, bx - ax));
          g.translate((ax + bx) / 2, 0.03, (az + bz) / 2);
          T.ref.add(new THREE.Mesh(g, asphalt));
        }
      if (fp.target) {
        const p = fp.target.pts;
        const line = (y: number) => {
          const pts = Array.from({ length: p.length / 2 + 1 }, (_, i) => new THREE.Vector3(p[(i * 2) % p.length], y, p[(i * 2 + 1) % p.length]));
          return new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: "#f0c05a" }));
        };
        T.ref.add(line(0.06), line(fp.target.h));
      }
      // The pin: a thin red post.
      const pin = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 6, 8), new THREE.MeshBasicMaterial({ color: "#ff3b30" }));
      pin.position.y = 3;
      T.ref.add(pin);
    }
    T.render();
  }, [fp]);

  // The model, placed like the game will place it.
  useEffect(() => {
    const T = three.current;
    if (!T) return;
    T.holder.clear();
    if (model) T.holder.add(model);
    T.holder.position.set(0, lift, 0);
    T.holder.rotation.y = (-yaw * Math.PI) / 180;
    T.holder.scale.setScalar(scale);
    T.render();
  }, [model, yaw, scale, lift]);

  return <div ref={mount} className="lm-preview" aria-label={t("3D preview of the store on its real footprint")} />;
}
