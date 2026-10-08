"use client";
// First-person fight (Counter-Strike / CoD style), rendered with three.js.
// Netcode: POST our position + scored hits to /api/match/:id every ~140 ms and
// get the whole match back. If we're the elected host we also drive the bots, and
// announce their shots (bot `shotAt`) so every client sees the same fight.
//
// Phones: floating left stick (push to the edge to sprint), right half to aim, a FIRE
// button you can drag to aim while shooting, light aim assist, and a resolution that
// adapts to what the GPU can keep up with.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { blocked, buildArena, collide, EYE, weaponOf, type Pt } from "@/lib/arena";
import type { MatchView } from "@/server/match";
import { api } from "../game/client";
import { sfx } from "../game/sfx";
import { isLite, isTouch } from "../perf";

type Player = MatchView["players"][number];
type Hud = {
  hp: number;
  maxHp: number;
  ammo: number;
  mag: number;
  weapon: string;
  reloading: number; // 0 = not reloading, else progress 0..1
  timeLeft: number;
  capture: number;
  captureNeeded: number;
  alive: { A: number; D: number };
  feed: { t: number; text: string }[];
  status: string;
  winner: string | null;
  team: string;
  kind: string;
  boss: { name: string; emoji: string; hp: number; maxHp: number; enraged: boolean; charging: boolean } | null;
  hit: "" | "body" | "head";
  hurt: boolean;
  hurtDir: number | null; // degrees, 0 = in front, clockwise
  inZone: boolean;
  kills: number;
  locked: boolean;
  sprint: boolean;
};

type Mat = THREE.MeshStandardMaterial | THREE.MeshLambertMaterial;
type Actor = {
  key: string;
  row: Player;
  isBoss: boolean;
  group: THREE.Group;
  hitboxes: THREE.Mesh[];
  body: Mat;
  glow: THREE.MeshBasicMaterial | null;
  pos: { x: number; z: number; yaw: number };
  target: { x: number; z: number; yaw: number };
  label: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; hp: number };
  /** Last announced shot (server ms), and when it goes off locally (wall ms, 0 = none). */
  shotAt: number;
  fireAt: number;
  chargeYaw: number;
  lastFired: number;
  /** Boss: draw the blast this frame. */
  blast: boolean;
  flashUntil: number;
};

type Input = { keys: Set<string>; joy: { x: number; y: number }; look: { dx: number; dy: number }; firing: boolean; reload: boolean; sprint: boolean; touching: boolean };

const FRIEND = 0x22e3ff;
const ENEMY = 0xff4d4d;
const TICK_MS = 140;
const STICK_R = 56; // px the knob can travel
const DEADZONE = 0.12;
const SPRINT_AT = 0.92;
// Boss attack: a beam with a visible wind-up you can strafe out of.
const WINDUP_MS = 650;
const WINDUP_ENRAGED_MS = 450;
const BEAM_W = 1.3; // metres either side of the beam that still get hit
const ENRAGE_AT = 0.35;
const ASSIST_CONE = 0.09; // rad (~5°) where touch aim assist engages

const mod = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

function drawLabel(a: Pick<Actor, "label">, name: string, pct: number, color: string) {
  const { ctx, tex } = a.label;
  ctx.clearRect(0, 0, 256, 64);
  ctx.font = "bold 26px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(0,0,0,.55)";
  ctx.fillRect(28, 40, 200, 12);
  ctx.fillStyle = color;
  ctx.fillRect(30, 42, 196 * Math.max(0, pct), 8);
  ctx.fillStyle = "#fff";
  ctx.fillText(name.slice(0, 18), 128, 30);
  tex.needsUpdate = true;
}

export default function Fps({ matchId, onExit }: { matchId: string; onExit: () => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const input = useRef<Input>({ keys: new Set(), joy: { x: 0, y: 0 }, look: { dx: 0, dy: 0 }, firing: false, reload: false, sprint: false, touching: false });
  const [hud, setHud] = useState<Hud | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touch] = useState(isTouch);
  const [fs, setFs] = useState<{ can: boolean; on: boolean }>({ can: false, on: false });
  const [tips, setTips] = useState(false);
  const joyBase = useRef<HTMLDivElement>(null);
  const joyKnob = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let net: ReturnType<typeof setInterval> | undefined;
    let hudTimer: ReturnType<typeof setInterval> | undefined;
    const cleanups: (() => void)[] = [];
    const lite = isLite();

    (async () => {
      let view: MatchView;
      try {
        view = await api<MatchView>(`/api/match/${matchId}`);
      } catch (e) {
        setError((e as Error).message);
        return;
      }
      if (disposed || !mount.current) return;
      const el = mount.current;
      const arena = buildArena(view.seed, view.kind);
      const mine = view.players.find((p) => p.key === view.me)!;
      const me = { x: mine.x, z: mine.z, yaw: mine.yaw, pitch: 0, hp: mine.hp, maxHp: mine.maxHp, team: mine.team, vx: 0, vz: 0 };
      const W = weaponOf(view.myWeapon); // the equipped weapon gear
      const st = {
        ammo: W.mag,
        reloadUntil: 0,
        reloadStart: 0,
        lastShot: 0,
        lastShotSfx: 0,
        hitUntil: 0,
        hitHead: false,
        hurtUntil: 0,
        hurtFrom: null as Pt | null,
        kick: 0,
        hits: [] as { key: string; head: boolean }[],
        botHits: [] as { from: string; key: string; dmg: number }[],
        botShots: [] as { from: string; at: number }[],
        inflight: false,
        ended: false,
        endSfx: false,
        offset: view.serverTime - Date.now(),
      };

      // ---- renderer / scene
      // Lite phones: no AA, low-power GPU hint, ≤ 1× pixels. Resolution then adapts
      // to the measured frame time (see the frame loop).
      const maxPR = Math.min(window.devicePixelRatio || 1, lite ? 1 : touch ? 1.5 : 2);
      const minPR = Math.min(maxPR, lite ? 0.6 : 0.75);
      let pr = maxPR;
      const renderer = new THREE.WebGLRenderer({ antialias: !touch && !lite, powerPreference: lite ? "low-power" : "high-performance", stencil: false });
      renderer.setPixelRatio(pr);
      renderer.setSize(el.clientWidth, el.clientHeight);
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const sky = view.kind === "raid" ? 0x1a0b10 : 0x0d1220;
      scene.background = new THREE.Color(sky);
      scene.fog = new THREE.Fog(sky, 25, lite ? 60 : 80);
      scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x20202a, 1.1));
      const sun = new THREE.DirectionalLight(0xffffff, 1.4);
      sun.position.set(20, 40, 10);
      scene.add(sun);

      // One material per colour (and the cheaper Lambert shading on lite phones).
      const mats = new Map<string, Mat>();
      const solid = (color: number, roughness = 0.8, metalness = 0) => {
        const k = `${color}|${roughness}|${metalness}`;
        let m = mats.get(k);
        if (!m) mats.set(k, (m = lite ? new THREE.MeshLambertMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness, metalness })));
        return m;
      };
      const ownMat = (color: number, emissive: number) =>
        lite ? new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: 0.15 }) : new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive, emissiveIntensity: 0.15 });

      const H = arena.half;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), solid(view.kind === "raid" ? 0x2a1c1c : 0x1c1f2b, 0.95));
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);
      const grid = new THREE.GridHelper(H * 2, 32, 0x3a3f55, 0x2a2e3f);
      grid.position.y = 0.01;
      scene.add(grid);

      const wallMeshes: THREE.Mesh[] = [];
      const unitBox = new THREE.BoxGeometry(1, 1, 1);
      for (const b of arena.walls) {
        const m = new THREE.Mesh(unitBox, solid(b.color));
        m.scale.set(b.w, b.h, b.d);
        m.position.set(b.x, b.h / 2, b.z);
        m.matrixAutoUpdate = false;
        m.updateMatrix();
        scene.add(m);
        wallMeshes.push(m);
      }
      if (arena.core) {
        const flag = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3, 0.15), solid(0xcccccc));
        flag.position.set(arena.core.x, arena.core.h + 1.5, arena.core.z);
        const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.05), new THREE.MeshBasicMaterial({ color: me.team === "D" ? FRIEND : ENEMY }));
        cloth.position.set(arena.core.x + 0.75, arena.core.h + 2.6, arena.core.z);
        scene.add(flag, cloth);
      }
      if (arena.zone) {
        const seg = lite ? 24 : 48;
        const ring = new THREE.Mesh(new THREE.RingGeometry(arena.zone.r - 0.25, arena.zone.r, seg), new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(arena.zone.x, 0.03, arena.zone.z);
        const glow = new THREE.Mesh(new THREE.CylinderGeometry(arena.zone.r, arena.zone.r, 0.6, seg, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
        glow.position.set(arena.zone.x, 0.3, arena.zone.z);
        scene.add(ring, glow);
      }

      const camera = new THREE.PerspectiveCamera(touch ? 80 : 75, el.clientWidth / el.clientHeight, 0.05, 200);
      camera.rotation.order = "YXZ";
      scene.add(camera);
      // Gun viewmodel + muzzle flash
      const gun = new THREE.Group();
      const gm = solid(0x2b2d36, 0.5, 0.4);
      const gBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.5), gm);
      const gBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), gm);
      gBarrel.position.set(0, 0.02, -0.38);
      const gMag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), solid(0x8a6a3a));
      gMag.position.set(0, -0.12, -0.05);
      gun.add(gBody, gBarrel, gMag);
      gun.scale.setScalar(0.7);
      gun.position.set(0.24, -0.24, -0.55);
      camera.add(gun);
      // A point light per shot is costly on weak GPUs; lite phones get the sprite only.
      const flash = lite ? null : new THREE.PointLight(0xffc860, 0, 6);
      if (flash) {
        flash.position.set(0.22, -0.18, -1);
        camera.add(flash);
      }
      const flashSprite = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }));
      flashSprite.position.set(0, 0.02, -0.56);
      gun.add(flashSprite);

      // ---- actors: other players / bots / boss
      const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
      const bodyGeo = new THREE.BoxGeometry(0.7, 1.35, 0.45);
      const visorGeo = new THREE.BoxGeometry(0.42, 0.1, 0.1);
      const gunGeo = new THREE.BoxGeometry(0.08, 0.1, 0.6);
      const makeActor = (p: Player, friendly: boolean, bossColor?: string): Actor => {
        const group = new THREE.Group();
        const isBoss = p.key === "boss";
        const color = isBoss ? new THREE.Color(bossColor ?? "#ff4d4d").getHex() : friendly ? FRIEND : ENEMY;
        const bodyMat = ownMat(color, color);
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        body.position.y = 0.68;
        const head = new THREE.Mesh(headGeo, solid(0xf1d3b3));
        head.position.y = 1.6;
        const glow = isBoss ? new THREE.MeshBasicMaterial({ color: 0xffd23f }) : null;
        const visor = new THREE.Mesh(visorGeo, glow ?? new THREE.MeshBasicMaterial({ color: 0x111111 }));
        visor.position.set(0, 1.63, -0.2);
        group.add(body, head, visor);
        body.userData = { key: p.key, head: false };
        head.userData = { key: p.key, head: true };
        if (isBoss) {
          // Heavy armor: shoulder plates, glowing eyes and twin arm cannons.
          const armor = solid(0x2b2b33, 0.4, 0.6);
          for (const side of [-1, 1]) {
            const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.55), armor);
            shoulder.position.set(side * 0.5, 1.28, 0);
            const cannon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.8), armor);
            cannon.position.set(side * 0.55, 0.9, -0.35);
            const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.02), glow!);
            eye.position.set(side * 0.09, 1.64, -0.21);
            group.add(shoulder, cannon, eye);
          }
        } else {
          const g = new THREE.Mesh(gunGeo, solid(0x222222));
          g.position.set(0.32, 1.05, -0.35);
          group.add(g);
        }

        const canvas = document.createElement("canvas");
        canvas.width = 256;
        canvas.height = 64;
        const tex = new THREE.CanvasTexture(canvas);
        const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
        sprite.scale.set(1.6, 0.4, 1);
        sprite.position.y = 2.15;
        group.add(sprite);
        if (isBoss) group.scale.setScalar(2.4);
        return {
          key: p.key,
          row: p,
          isBoss,
          group,
          hitboxes: [body, head],
          body: bodyMat,
          glow,
          pos: { x: p.x, z: p.z, yaw: p.yaw },
          target: { x: p.x, z: p.z, yaw: p.yaw },
          label: { ctx: canvas.getContext("2d")!, tex, hp: -1 },
          shotAt: p.shotAt,
          fireAt: 0,
          chargeYaw: p.yaw,
          lastFired: 0,
          blast: false,
          flashUntil: 0,
        };
      };

      const actors = new Map<string, Actor>();
      const sims = new Map<string, { x: number; z: number; yaw: number; nextShot: number; side: number; charge: { fireAt: number; yaw: number } | null }>();
      let host = view.host;
      const bossEnraged = () => {
        const b = actors.get("boss");
        return !!b && b.row.hp > 0 && b.row.hp / b.row.maxHp < ENRAGE_AT;
      };
      const syncActors = (v: MatchView) => {
        const wall = Date.now();
        for (const p of v.players) {
          if (p.key === v.me) continue;
          let a = actors.get(p.key);
          if (!a) {
            a = makeActor(p, p.team === me.team, v.boss?.color);
            actors.set(p.key, a);
            scene.add(a.group);
          }
          a.row = p;
          if (!(host && p.bot)) a.target = { x: p.x, z: p.z, yaw: p.yaw };
          // A shot the host announced: wind-up now, the hit when its time comes.
          if (!host && p.bot && p.shotAt > a.shotAt + 50) {
            a.shotAt = p.shotAt;
            a.fireAt = Math.max(wall, p.shotAt - st.offset);
            a.chargeYaw = p.yaw;
          }
          const visible = p.hp > 0 && !p.gone;
          a.group.visible = visible;
          if (a.label.hp !== p.hp) {
            a.label.hp = p.hp;
            drawLabel(a, p.name, p.hp / p.maxHp, p.team === me.team ? "#22e3ff" : "#ff4d4d");
          }
        }
      };
      syncActors(view);

      // ---- tracers: a small pool of reusable lines, one shared material per colour
      const lineMats = new Map<number, THREE.LineBasicMaterial>();
      const lineMat = (c: number) => {
        let m = lineMats.get(c);
        if (!m) lineMats.set(c, (m = new THREE.LineBasicMaterial({ color: c, transparent: true, opacity: 0.9 })));
        return m;
      };
      const tracers: { line: THREE.Line; until: number }[] = [];
      const tracer = (from: THREE.Vector3, to: THREE.Vector3, color: number, ms = 70) => {
        const now = performance.now();
        let t = tracers.find((x) => !x.line.visible);
        if (!t) {
          if (tracers.length >= 32) t = tracers.reduce((a, b) => (a.until < b.until ? a : b));
          else {
            const g = new THREE.BufferGeometry();
            g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
            const line = new THREE.Line(g, lineMat(color));
            line.frustumCulled = false;
            scene.add(line);
            tracers.push((t = { line, until: 0 }));
          }
        }
        const pos = t.line.geometry.getAttribute("position") as THREE.BufferAttribute;
        pos.setXYZ(0, from.x, from.y, from.z);
        pos.setXYZ(1, to.x, to.y, to.z);
        pos.needsUpdate = true;
        t.line.material = lineMat(color);
        t.line.visible = true;
        t.until = now + ms;
      };

      // ---- boss beam: a thin aiming laser while it winds up, then the blast
      const beamMat = new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0, depthWrite: false });
      const beam = new THREE.Mesh(unitBox, beamMat);
      beam.visible = false;
      scene.add(beam);
      let beamUntil = 0;
      const beamRay = new THREE.Raycaster();
      const beamDir = new THREE.Vector3();
      const beamFrom = new THREE.Vector3();
      const beamTo = new THREE.Vector3();
      /** Where a beam fired along `yaw` from the boss stops (first wall, max 45 m). */
      const beamEnd = (a: Actor, yaw: number) => {
        beamFrom.set(a.pos.x - Math.sin(yaw) * 1.2, 2.2, a.pos.z - Math.cos(yaw) * 1.2);
        beamDir.set(-Math.sin(yaw), -0.02, -Math.cos(yaw)).normalize();
        beamRay.set(beamFrom, beamDir);
        beamRay.far = 45;
        const hit = beamRay.intersectObjects(wallMeshes, false)[0];
        beamTo.copy(hit ? hit.point : beamFrom.clone().addScaledVector(beamDir, 45));
        return { from: beamFrom, to: beamTo, len: hit ? hit.distance : 45 };
      };
      const placeBeam = (from: THREE.Vector3, to: THREE.Vector3, thick: number, opacity: number) => {
        beam.position.copy(from).add(to).multiplyScalar(0.5);
        beam.lookAt(to);
        beam.scale.set(thick, thick, from.distanceTo(to));
        beamMat.opacity = opacity;
        beam.visible = true;
      };

      // ---- input
      const onKey = (e: KeyboardEvent, down: boolean) => {
        const k = e.key.toLowerCase();
        if (down) input.current.keys.add(k);
        else input.current.keys.delete(k);
        if (down && k === "r") input.current.reload = true;
      };
      const kd = (e: KeyboardEvent) => onKey(e, true);
      const ku = (e: KeyboardEvent) => onKey(e, false);
      const mm = (e: MouseEvent) => {
        if (document.pointerLockElement !== renderer.domElement) return;
        input.current.look.dx += e.movementX;
        input.current.look.dy += e.movementY;
      };
      const md = (e: MouseEvent) => {
        if (touch) return;
        if (document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock?.();
        else if (e.button === 0) input.current.firing = true;
      };
      const mu = () => {
        if (!touch) input.current.firing = false;
      };
      window.addEventListener("keydown", kd);
      window.addEventListener("keyup", ku);
      window.addEventListener("mousemove", mm);
      renderer.domElement.addEventListener("mousedown", md);
      window.addEventListener("mouseup", mu);

      // Rotating a phone fires a burst of resize events while the URL bar settles; each
      // setSize reallocates the GPU buffers. Coalesce to one resize per frame, and only
      // when the size really changed.
      let sized = { w: el.clientWidth, h: el.clientHeight };
      let resizeRaf = 0;
      const applySize = () => {
        resizeRaf = 0;
        const w = el.clientWidth;
        const h = el.clientHeight;
        if (!w || !h || (w === sized.w && h === sized.h)) return;
        sized = { w, h };
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(() => {
        if (!resizeRaf) resizeRaf = requestAnimationFrame(applySize);
      });
      ro.observe(el);
      cleanups.push(() => {
        window.removeEventListener("keydown", kd);
        window.removeEventListener("keyup", ku);
        window.removeEventListener("mousemove", mm);
        window.removeEventListener("mouseup", mu);
        ro.disconnect();
        cancelAnimationFrame(resizeRaf);
        if (document.pointerLockElement) document.exitPointerLock();
      });

      // ---- shooting
      const ray = new THREE.Raycaster();
      ray.far = W.range;
      const ndc = new THREE.Vector2();
      const muzzle = new THREE.Vector3();
      const endPt = new THREE.Vector3();
      const shoot = (now: number, moving: boolean) => {
        st.lastShot = now;
        st.ammo--;
        st.kick = 1;
        me.pitch = Math.min(1.4, me.pitch + 0.006);
        if (now - st.lastShotSfx > (lite ? 180 : 90)) {
          st.lastShotSfx = now;
          sfx("shot");
        }
        const spread = (moving ? 0.035 : 0.01) * W.spread;
        ndc.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread);
        ray.setFromCamera(ndc, camera);
        const targets: THREE.Object3D[] = [...wallMeshes];
        for (const a of actors.values()) if (a.row.team !== me.team && a.row.hp > 0 && a.group.visible) targets.push(...a.hitboxes);
        const hit = ray.intersectObjects(targets, false)[0];
        gBarrel.getWorldPosition(muzzle);
        tracer(muzzle, hit ? hit.point : ray.ray.at(W.range, endPt), 0xffe08a);
        const key = hit?.object.userData.key as string | undefined;
        if (key) {
          const head = !!hit!.object.userData.head;
          st.hits.push({ key, head });
          st.hitUntil = now + 140;
          st.hitHead = head;
          const a = actors.get(key);
          if (a) a.flashUntil = now + 70;
          navigator.vibrate?.(head ? 22 : 10);
          if (head) sfx("hit");
        }
        if (st.ammo <= 0) startReload(now);
      };
      const startReload = (now: number) => {
        if (st.reloadUntil > now || st.ammo >= W.mag) return;
        st.reloadStart = now;
        st.reloadUntil = now + W.reloadMs;
        sfx("reload");
      };

      // ---- host-side bot AI
      const humanTargets = (): (Pt & { key: string })[] => {
        const out: (Pt & { key: string })[] = [];
        if (me.team === "A" && me.hp > 0) out.push({ key: view.me, x: me.x, z: me.z });
        for (const a of actors.values()) if (!a.row.bot && a.row.team === "A" && a.row.hp > 0 && !a.row.gone) out.push({ key: a.key, x: a.pos.x, z: a.pos.z });
        return out;
      };
      const runBots = (dt: number, now: number, wall: number) => {
        const targets = humanTargets();
        const enraged = bossEnraged();
        for (const a of actors.values()) {
          if (!a.row.bot || a.row.hp <= 0) continue;
          let s = sims.get(a.key);
          // First shots wait a few seconds: time to find your thumbs on a phone.
          if (!s) sims.set(a.key, (s = { x: a.pos.x, z: a.pos.z, yaw: a.pos.yaw, nextShot: now + 3000 + Math.random() * 1000, side: Math.random() < 0.5 ? -1 : 1, charge: null }));
          const isBoss = a.isBoss;

          // Boss beam winding up: feet planted, aim locked — strafe out of the red line.
          if (isBoss && s.charge) {
            if (wall >= s.charge.fireAt) {
              const { from } = beamEnd(a, s.charge.yaw);
              const fx = -Math.sin(s.charge.yaw);
              const fz = -Math.cos(s.charge.yaw);
              const dmg = Math.round((view.boss?.dmg ?? 15) * (enraged ? 2 : 1.6));
              for (const t of targets) {
                const rx = t.x - from.x;
                const rz = t.z - from.z;
                const along = rx * fx + rz * fz;
                const off = Math.abs(rx * fz - rz * fx);
                if (along > 0 && along < 45 && off < BEAM_W && !blocked({ x: from.x, z: from.z }, t, arena.walls)) st.botHits.push({ from: a.key, key: t.key, dmg });
              }
              s.charge = null;
              s.nextShot = now + (enraged ? 900 : 1300);
            }
            a.target = { x: s.x, z: s.z, yaw: s.yaw };
            continue;
          }

          let best: (Pt & { key: string }) | null = null;
          let bd = Infinity;
          for (const t of targets) {
            const d = Math.hypot(t.x - s.x, t.z - s.z);
            if (d < bd) [best, bd] = [t, d];
          }
          if (!best) continue;
          const los = !blocked(s, best, arena.walls);
          const speed = isBoss ? (view.boss?.speed ?? 2.5) * (enraged ? 1.35 : 1) : 3.2;
          const want = isBoss ? 5 : 11;
          let dx = best.x - s.x;
          let dz = best.z - s.z;
          const len = Math.hypot(dx, dz) || 1;
          dx /= len;
          dz /= len;
          let mx = 0;
          let mz = 0;
          if (!los || bd > want) [mx, mz] = [dx, dz];
          else if (!isBoss) [mx, mz] = [-dz * s.side * 0.6, dx * s.side * 0.6]; // strafe while shooting
          if (mx || mz) {
            const step = speed * dt;
            let next = collide({ x: s.x + mx * step, z: s.z + mz * step }, arena.walls, isBoss ? 1.1 : 0.4);
            if (Math.hypot(next.x - s.x, next.z - s.z) < step * 0.3) {
              // stuck on cover: slide around it
              s.side = -s.side;
              next = collide({ x: s.x - mz * s.side * step, z: s.z + mx * s.side * step }, arena.walls, isBoss ? 1.1 : 0.4);
            }
            s.x = next.x;
            s.z = next.z;
          }
          s.yaw = Math.atan2(-dx, -dz);
          if (los && bd < 32 && now >= s.nextShot) {
            if (isBoss) {
              const windup = enraged ? WINDUP_ENRAGED_MS : WINDUP_MS;
              s.charge = { fireAt: wall + windup, yaw: s.yaw };
              a.shotAt = Math.round(wall + st.offset + windup);
              a.fireAt = wall + windup;
              a.chargeYaw = s.yaw;
              st.botShots.push({ from: a.key, at: a.shotAt });
            } else {
              s.nextShot = now + 900 + Math.random() * 700;
              const landed = Math.random() < Math.max(0.15, 0.55 - bd / 60);
              if (landed) st.botHits.push({ from: a.key, key: best.key, dmg: 8 + Math.round(Math.random() * 6) });
              a.shotAt = Math.round(wall + st.offset);
              a.lastFired = wall;
              st.botShots.push({ from: a.key, at: a.shotAt });
              const from = new THREE.Vector3(s.x, 1.1, s.z);
              const to = new THREE.Vector3(best.x + (landed ? 0 : (Math.random() - 0.5) * 2), 1.2, best.z + (landed ? 0 : (Math.random() - 0.5) * 2));
              tracer(from, to, 0xff6060);
            }
          }
          a.target = { x: s.x, z: s.z, yaw: s.yaw };
        }
      };

      /** Shots announced by the host, drawn on every other client. */
      const playShots = (wall: number) => {
        for (const a of actors.values()) {
          if (!a.fireAt || wall < a.fireAt || host) continue;
          a.fireAt = 0;
          a.lastFired = wall;
          if (a.isBoss) {
            a.blast = true; // the beam is drawn in the frame loop
            continue;
          }
          // A guard fires along where it faces; ends on us if we're in its sights.
          const yaw = a.pos.yaw;
          const fx = -Math.sin(yaw);
          const fz = -Math.cos(yaw);
          const rx = me.x - a.pos.x;
          const rz = me.z - a.pos.z;
          const along = rx * fx + rz * fz;
          const len = along > 0 && Math.abs(rx * fz - rz * fx) < 2 ? along : 25;
          tracer(new THREE.Vector3(a.pos.x, 1.1, a.pos.z), new THREE.Vector3(a.pos.x + fx * len, 1.2, a.pos.z + fz * len), 0xff6060);
        }
      };

      // ---- network
      const apply = (v: MatchView) => {
        view = v;
        st.offset = v.serverTime - Date.now();
        if (v.host && !host) sims.clear();
        host = v.host;
        const row = v.players.find((p) => p.key === v.me);
        if (row) {
          if (row.hp < me.hp) {
            st.hurtUntil = performance.now() + 250;
            // Who shot us? Whoever fired most recently and is closest; else the nearest enemy.
            const wall = Date.now();
            let from: Actor | null = null;
            let fd = Infinity;
            for (const a of actors.values()) {
              if (a.row.team === me.team || a.row.hp <= 0) continue;
              const d = Math.hypot(a.pos.x - me.x, a.pos.z - me.z) + (wall - a.lastFired < 1500 ? 0 : 1000);
              if (d < fd) [from, fd] = [a, d];
            }
            st.hurtFrom = from ? { x: from.pos.x, z: from.pos.z } : null;
            sfx("hurt");
            navigator.vibrate?.(30);
          }
          me.hp = row.hp;
          me.maxHp = row.maxHp;
        }
        syncActors(v);
        if (v.status !== "LIVE") st.ended = true;
      };
      net = setInterval(async () => {
        if (st.inflight || st.ended) return;
        st.inflight = true;
        const inZone = !!arena.zone && Math.hypot(me.x - arena.zone.x, me.z - arena.zone.z) <= arena.zone.r;
        const hits = st.hits.splice(0);
        const botHits = st.botHits.splice(0);
        const botShots = st.botShots.splice(0);
        const bots = host ? [...sims.entries()].map(([key, s]) => ({ key, x: s.x, z: s.z, yaw: s.yaw })) : undefined;
        try {
          apply(await api<MatchView>(`/api/match/${matchId}`, { body: { x: me.x, z: me.z, yaw: me.yaw, inZone, hits, botHits, botShots, bots } }));
        } catch {
          // transient network error: keep playing, next tick retries
        } finally {
          st.inflight = false;
        }
      }, TICK_MS);

      // HUD at 10 Hz, and React only re-renders when something on it changed.
      let lastHud = "";
      hudTimer = setInterval(() => {
        const now = performance.now();
        const alive = { A: 0, D: 0 };
        for (const p of view.players) if (p.hp > 0 && !p.gone) alive[p.team as "A" | "D"]++;
        const b = view.players.find((p) => p.key === "boss");
        const bossA = actors.get("boss");
        let hurtDir: number | null = null;
        if (st.hurtFrom && now < st.hurtUntil + 650) {
          const bearing = Math.atan2(-(st.hurtFrom.x - me.x), -(st.hurtFrom.z - me.z));
          hurtDir = Math.round((-mod(bearing - me.yaw) * 180) / Math.PI);
        }
        const next: Hud = {
          hp: me.hp,
          maxHp: me.maxHp,
          ammo: st.ammo,
          mag: W.mag,
          weapon: W.name,
          reloading: st.reloadUntil > now ? Math.round(((now - st.reloadStart) / (st.reloadUntil - st.reloadStart)) * 20) / 20 || 0.05 : 0,
          timeLeft: Math.max(0, Math.round((view.endsAt - (Date.now() + st.offset)) / 1000)),
          capture: view.capture,
          captureNeeded: view.captureNeeded,
          alive,
          feed: view.feed,
          status: view.status,
          winner: view.winner,
          team: me.team,
          kind: view.kind,
          boss: b && view.boss ? { name: view.boss.name, emoji: view.boss.emoji, hp: b.hp, maxHp: b.maxHp, enraged: bossEnraged(), charging: !!bossA && bossA.fireAt > Date.now() } : null,
          hit: st.hitUntil > now ? (st.hitHead ? "head" : "body") : "",
          hurt: st.hurtUntil > now,
          hurtDir,
          inZone: !!arena.zone && Math.hypot(me.x - arena.zone.x, me.z - arena.zone.z) <= arena.zone.r,
          kills: view.players.find((p) => p.key === view.me)?.kills ?? 0,
          locked: touch || document.pointerLockElement === renderer.domElement,
          sprint: input.current.sprint,
        };
        if (next.status !== "LIVE" && !st.endSfx) {
          st.endSfx = true;
          sfx(next.winner === next.team ? "win" : "lose");
        }
        const key = JSON.stringify(next);
        if (key !== lastHud) {
          lastHud = key;
          setHud(next);
        }
      }, 100);

      // ---- frame loop
      let last = performance.now();
      let frameAvg = 16;
      let lastScale = last;
      let goodWindows = 0;
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const rawDt = now - last;
        const dt = Math.min(0.05, rawDt / 1000);
        last = now;
        const wall = Date.now();

        // Adaptive resolution: drop pixels when frames run long, win them back slowly.
        frameAvg += (Math.min(100, rawDt) - frameAvg) * 0.05;
        if (now - lastScale > 2000) {
          lastScale = now;
          let want = pr;
          if (frameAvg > 24 && pr > minPR) {
            want = Math.max(minPR, pr - 0.15);
            goodWindows = 0;
          } else if (frameAvg < 15 && pr < maxPR && ++goodWindows >= 3) {
            want = Math.min(maxPR, pr + 0.1);
            goodWindows = 0;
          }
          if (want !== pr) {
            pr = want;
            renderer.setPixelRatio(pr);
          }
        }

        const inp = input.current;
        // Touch aim: pixels → radians scaled to the screen, with a gentle flick boost.
        const short = Math.max(320, Math.min(window.innerWidth, window.innerHeight));
        const lookLen = Math.hypot(inp.look.dx, inp.look.dy);
        let sens = touch ? (2.3 / short) * (1 + Math.min(1, lookLen / 40) * 0.6) : 0.0024;

        const alive = me.hp > 0 && !st.ended;
        // Touch aim assist: slow down and gently pull onto an enemy near the crosshair.
        if (touch && alive && (inp.firing || inp.touching)) {
          let best: { dy: number; dp: number; off: number } | null = null;
          for (const a of actors.values()) {
            if (a.row.team === me.team || a.row.hp <= 0 || !a.group.visible) continue;
            const tx = a.pos.x - me.x;
            const tz = a.pos.z - me.z;
            const dist = Math.hypot(tx, tz);
            if (dist > W.range || dist < 0.5) continue;
            const cy = a.isBoss ? 2.2 : 1.1;
            const dyaw = mod(Math.atan2(-tx, -tz) - me.yaw);
            const dp = Math.atan2(cy - EYE, dist) - me.pitch;
            const off = Math.hypot(dyaw, dp);
            const cone = ASSIST_CONE * (a.isBoss ? 1.6 : 1);
            if (off < cone && (!best || off < best.off) && !blocked(me, a.pos, arena.walls)) best = { dy: dyaw, dp, off: off / cone };
          }
          if (best) {
            sens *= 0.6;
            const pull = 0.7 * (1 - best.off) * dt;
            me.yaw += Math.sign(best.dy) * Math.min(Math.abs(best.dy), pull);
            me.pitch += Math.sign(best.dp) * Math.min(Math.abs(best.dp), pull * 0.5);
          }
        }
        me.yaw -= inp.look.dx * sens;
        me.pitch = Math.max(-1.3, Math.min(1.3, me.pitch - inp.look.dy * sens));
        inp.look.dx = inp.look.dy = 0;

        let fwd = 0;
        let strafe = 0;
        if (alive) {
          const k = inp.keys;
          fwd = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0) - inp.joy.y;
          strafe = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0) + inp.joy.x;
          const mag = Math.hypot(fwd, strafe);
          if (mag > 1) [fwd, strafe] = [fwd / mag, strafe / mag];
          const sprinting = inp.keys.has("shift") || inp.sprint;
          const speed = (sprinting ? 7.5 : 5.5) * view.mySpeed;
          const sin = Math.sin(me.yaw);
          const cos = Math.cos(me.yaw);
          // Quick but not instant acceleration: precise on a thumbstick, no ice-skating.
          const a = 1 - Math.exp(-dt * 14);
          me.vx += ((-sin * fwd + cos * strafe) * speed - me.vx) * a;
          me.vz += ((-cos * fwd - sin * strafe) * speed - me.vz) * a;
          const next = collide({ x: me.x + me.vx * dt, z: me.z + me.vz * dt }, arena.walls);
          me.x = next.x;
          me.z = next.z;

          if (inp.reload) startReload(now);
          inp.reload = false;
          if (st.reloadUntil && st.reloadUntil <= now) {
            st.reloadUntil = 0;
            st.ammo = W.mag;
          }
          if (inp.firing && !st.reloadUntil && st.ammo > 0 && now - st.lastShot >= W.intervalMs) shoot(now, Math.hypot(fwd, strafe) > 0.1);
        } else me.vx = me.vz = 0;
        if (host && !st.ended) runBots(dt, now, wall);
        playShots(wall);

        const k = 1 - Math.exp(-dt * 12);
        const enraged = bossEnraged();
        let beamOn = false;
        for (const a of actors.values()) {
          a.pos.x += (a.target.x - a.pos.x) * k;
          a.pos.z += (a.target.z - a.pos.z) * k;
          a.pos.yaw += mod(a.target.yaw - a.pos.yaw) * k;
          a.group.position.set(a.pos.x, 0, a.pos.z);
          a.group.rotation.y = a.pos.yaw;
          if (!a.isBoss) {
            a.body.emissiveIntensity = now < a.flashUntil ? 1 : 0.15;
            continue;
          }
          // Boss: glows hotter as it winds up, pulses red when enraged, flashes on hits.
          const charging = a.fireAt > wall && a.row.hp > 0;
          const charge = charging ? 1 - (a.fireAt - wall) / (enraged ? WINDUP_ENRAGED_MS : WINDUP_MS) : 0;
          a.body.emissiveIntensity = now < a.flashUntil ? 1.2 : charging ? 0.3 + Math.max(0, charge) * 1.2 : enraged ? 0.35 + Math.sin(now / 120) * 0.2 : 0.15;
          if (enraged) a.body.emissive.setHex(0xff2020);
          a.glow?.color.setHex(charging ? 0xff2020 : 0xffd23f);
          a.group.scale.setScalar(enraged ? 2.6 : 2.4);
          if (charging) {
            const { from, to } = beamEnd(a, a.chargeYaw);
            placeBeam(from, to, 0.05 + charge * 0.08, 0.25 + charge * 0.35);
            beamOn = true;
          } else if (a.blast || (host && a.fireAt && wall >= a.fireAt)) {
            a.blast = false;
            a.fireAt = 0;
            a.lastFired = wall;
            const { from, to } = beamEnd(a, a.chargeYaw);
            placeBeam(from, to, 0.45, 0.95);
            beamUntil = now + 160;
            beamOn = true;
            st.kick = Math.max(st.kick, 0.5);
            if (Math.hypot(a.pos.x - me.x, a.pos.z - me.z) < 30) navigator.vibrate?.(40);
          }
        }
        if (!beamOn) {
          if (now < beamUntil) beamMat.opacity = 0.95 * ((beamUntil - now) / 160);
          else beam.visible = false;
        }

        const bob = alive && Math.hypot(fwd, strafe) > 0.1 ? Math.sin(now / (inp.sprint ? 70 : 90)) * 0.03 : 0;
        camera.position.set(me.x, alive ? EYE + bob : 0.5, me.z);
        camera.rotation.set(me.pitch, me.yaw, alive ? 0 : 0.4);
        st.kick *= 0.8;
        gun.position.z = -0.55 + st.kick * 0.05;
        gun.visible = alive;
        const flashOn = now - st.lastShot < 45;
        if (flash) flash.intensity = flashOn ? 3 : 0;
        (flashSprite.material as THREE.MeshBasicMaterial).opacity = flashOn ? 1 : 0;
        flashSprite.rotation.z = Math.random() * Math.PI;

        for (const t of tracers) if (t.line.visible && t.until < now) t.line.visible = false;
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(frame);

      cleanups.push(() => {
        const geos = new Set<THREE.BufferGeometry>();
        const ms = new Set<THREE.Material>();
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.geometry) geos.add(m.geometry);
          const mat = m.material as THREE.Material | THREE.Material[] | undefined;
          (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => ms.add(x));
          const map = (m.material as THREE.SpriteMaterial | undefined)?.map;
          map?.dispose();
        });
        geos.forEach((g) => g.dispose());
        ms.forEach((m) => m.dispose());
        lineMats.forEach((m) => m.dispose());
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      });
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      clearInterval(net);
      clearInterval(hudTimer);
      cleanups.forEach((c) => c());
    };
  }, [matchId, touch]);

  // ---- fullscreen + landscape (Android): a wider view, and no URL bar resizing mid-fight
  useEffect(() => {
    const d = document as Document & { webkitFullscreenElement?: Element };
    const can = touch && !!document.documentElement.requestFullscreen && !/iP(hone|od|ad)/.test(navigator.userAgent);
    const sync = () => setFs({ can, on: !!(document.fullscreenElement ?? d.webkitFullscreenElement) });
    sync();
    document.addEventListener("fullscreenchange", sync);
    // A few tips on the first fights.
    try {
      const n = Number(localStorage.getItem("sq_fps_tips") ?? 0);
      if (touch && n < 3) {
        localStorage.setItem("sq_fps_tips", String(n + 1));
        setTips(true);
        setTimeout(() => setTips(false), 5500);
      }
    } catch {}
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      const o = screen.orientation as ScreenOrientation & { unlock?: () => void };
      try {
        o?.unlock?.();
      } catch {}
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [touch]);
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
      return;
    }
    document.documentElement
      .requestFullscreen({ navigationUI: "hide" })
      .then(() => (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> })?.lock?.("landscape"))
      .catch(() => {});
  };

  // ---- touch controls: floating stick on the left, aim on the right, drag FIRE to aim
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);
  const lookPtr = useRef<{ id: number; x: number; y: number } | null>(null);
  const firePtr = useRef<{ id: number; x: number; y: number } | null>(null);
  const setKnob = (x: number, y: number) => {
    if (joyKnob.current) joyKnob.current.style.transform = `translate(${x * STICK_R}px, ${y * STICK_R}px)`;
  };
  const onStick = (e: React.PointerEvent, phase: "down" | "move" | "up") => {
    const inp = input.current;
    if (phase === "down") {
      if (stick.current) return;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      stick.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      // The stick appears under the thumb, wherever it lands.
      const base = joyBase.current;
      if (base) {
        const r = (e.currentTarget as Element).getBoundingClientRect();
        base.style.left = `${e.clientX - r.left}px`;
        base.style.top = `${e.clientY - r.top}px`;
        base.classList.add("on");
      }
      return;
    }
    if (!stick.current || stick.current.id !== e.pointerId) return;
    if (phase === "up") {
      stick.current = null;
      inp.joy = { x: 0, y: 0 };
      inp.sprint = false;
      setKnob(0, 0);
      const base = joyBase.current;
      if (base) {
        base.style.left = "";
        base.style.top = "";
        base.classList.remove("on", "sprint");
      }
      return;
    }
    const dx = e.clientX - stick.current.x;
    const dy = e.clientY - stick.current.y;
    const raw = Math.min(1, Math.hypot(dx, dy) / STICK_R);
    const a = Math.atan2(dy, dx);
    // Dead zone, rescaled so movement still starts smoothly from zero.
    const m = raw < DEADZONE ? 0 : (raw - DEADZONE) / (1 - DEADZONE);
    inp.joy = { x: Math.cos(a) * m, y: Math.sin(a) * m };
    const sprint = raw >= SPRINT_AT && Math.sin(a) < -0.7; // pushed hard forward
    if (sprint !== inp.sprint) {
      inp.sprint = sprint;
      if (sprint) navigator.vibrate?.(8);
      joyBase.current?.classList.toggle("sprint", sprint);
    }
    setKnob(Math.cos(a) * raw, Math.sin(a) * raw);
  };
  const drag = (ref: React.MutableRefObject<{ id: number; x: number; y: number } | null>, e: React.PointerEvent) => {
    const p = ref.current;
    if (!p || p.id !== e.pointerId) return;
    input.current.look.dx += e.clientX - p.x;
    input.current.look.dy += e.clientY - p.y;
    ref.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
  };
  const onLook = (e: React.PointerEvent, phase: "down" | "move" | "up") => {
    if (phase === "down") {
      if (lookPtr.current) return;
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      lookPtr.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      input.current.touching = true;
      return;
    }
    if (phase === "move") return drag(lookPtr, e);
    if (lookPtr.current?.id === e.pointerId) {
      lookPtr.current = null;
      input.current.touching = false;
    }
  };
  const onFire = (e: React.PointerEvent, phase: "down" | "move" | "up") => {
    e.stopPropagation();
    if (phase === "down") {
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      firePtr.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      input.current.firing = true;
      return;
    }
    if (phase === "move") return drag(firePtr, e);
    if (firePtr.current?.id === e.pointerId) {
      firePtr.current = null;
      input.current.firing = false;
    }
  };

  const won = hud?.winner === hud?.team;
  const objective =
    hud?.kind === "raid"
      ? "Take down the boss — strafe out of its red beam"
      : hud?.team === "A"
        ? "Capture the zone in front of the Command Center — or wipe out the defenders"
        : "Hold the Command Center until time runs out";

  return (
    <div className="fps">
      <div ref={mount} className="fps-view" />
      {error && (
        <div className="fps-center">
          <div className="modal">
            <h2>Can&apos;t join</h2>
            <p className="muted">{error}</p>
            <button className="btn" onClick={onExit}>Back to map</button>
          </div>
        </div>
      )}
      {hud && (
        <>
          <div className={`fps-hurt ${hud.hurt ? "on" : ""}`} />
          {hud.hurtDir != null && (
            <div className="fps-dmg" style={{ transform: `rotate(${hud.hurtDir}deg)` }}>
              <i />
            </div>
          )}
          <div className={`fps-cross ${hud.hit}`} />
          <div className="fps-top">
            <div className="fps-score">
              <span style={{ color: hud.team === "A" ? "var(--cyan)" : "var(--red)" }}>⚔️ {hud.alive.A}</span>
              <b className={hud.timeLeft <= 20 ? "low" : ""}>
                {Math.floor(hud.timeLeft / 60)}:{String(hud.timeLeft % 60).padStart(2, "0")}
              </b>
              <span style={{ color: hud.team === "D" ? "var(--cyan)" : "var(--red)" }}>🛡️ {hud.alive.D}</span>
            </div>
            {hud.kind === "breach" && (
              <div className="fps-bar">
                <i style={{ width: `${Math.min(100, (hud.capture / hud.captureNeeded) * 100)}%`, background: "var(--yellow)" }} />
                <span>{hud.inZone && hud.team === "A" ? "CAPTURING…" : `CAPTURE ${Math.round((hud.capture / hud.captureNeeded) * 100)}%`}</span>
              </div>
            )}
            {hud.boss && (
              <div className={`fps-bar boss ${hud.boss.enraged ? "enraged" : ""} ${hud.boss.charging ? "charging" : ""}`}>
                <i style={{ width: `${(hud.boss.hp / hud.boss.maxHp) * 100}%` }} />
                <span>
                  {hud.boss.emoji} {hud.boss.name} · {hud.boss.hp.toLocaleString()} HP{hud.boss.enraged ? " · ENRAGED" : ""}
                </span>
              </div>
            )}
            {hud.boss?.charging && <div className="fps-warn">⚠ BEAM INCOMING — MOVE!</div>}
            <div className="fps-obj">{objective}</div>
          </div>
          <div className="fps-feed">
            {hud.feed.map((f) => (
              <div key={f.t + f.text}>{f.text}</div>
            ))}
          </div>
          <div className="fps-stats">
            <div className="fps-hp">
              <b>{hud.hp}</b>
              <div className="fps-bar small"><i style={{ width: `${(hud.hp / hud.maxHp) * 100}%`, background: hud.hp < 30 ? "var(--red)" : "var(--green)" }} /></div>
            </div>
            <div className="fps-ammo">
              <div className="small muted">{hud.weapon}</div>
              {hud.reloading ? (
                <span className="fps-reloading">
                  RELOADING
                  <i style={{ width: `${hud.reloading * 100}%` }} />
                </span>
              ) : (
                <>
                  <b className={hud.ammo <= Math.ceil(hud.mag / 5) ? "low" : ""}>{hud.ammo}</b> / {hud.mag}
                </>
              )}
            </div>
          </div>
          <div className="fps-corner">
            {fs.can && (
              <button className="fps-btn" onClick={toggleFullscreen} aria-label={fs.on ? "Exit full screen" : "Full screen"}>
                {fs.on ? "🗗" : "⛶"}
              </button>
            )}
            <button className="fps-btn" onClick={onExit}>✕ Leave</button>
          </div>
          {!hud.locked && hud.status === "LIVE" && (
            <div className="fps-help">
              <b>Click to fight</b>
              <span>WASD move · Shift sprint · Mouse aim · Click shoot · R reload · Esc release</span>
            </div>
          )}
          {hud.hp <= 0 && hud.status === "LIVE" && <div className="fps-down">💀 You&apos;re down — no respawns this round</div>}
          {touch && hud.status === "LIVE" && hud.hp > 0 && (
            <>
              <div className="fps-look" onPointerDown={(e) => onLook(e, "down")} onPointerMove={(e) => onLook(e, "move")} onPointerUp={(e) => onLook(e, "up")} onPointerCancel={(e) => onLook(e, "up")} />
              <div className="fps-move" onPointerDown={(e) => onStick(e, "down")} onPointerMove={(e) => onStick(e, "move")} onPointerUp={(e) => onStick(e, "up")} onPointerCancel={(e) => onStick(e, "up")}>
                <div ref={joyBase} className="fps-joy">
                  <div ref={joyKnob} />
                </div>
              </div>
              <button
                className={`fps-fire ${hud.reloading ? "reloading" : ""}`}
                onPointerDown={(e) => onFire(e, "down")}
                onPointerMove={(e) => onFire(e, "move")}
                onPointerUp={(e) => onFire(e, "up")}
                onPointerCancel={(e) => onFire(e, "up")}
                onContextMenu={(e) => e.preventDefault()}
              >
                FIRE
              </button>
              <button
                className="fps-reload"
                aria-label="Reload"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  input.current.reload = true;
                }}
              >
                ⟳
              </button>
              {tips && (
                <div className="fps-tips">
                  <span>👈 Left thumb: move · push to the edge to sprint</span>
                  <span>Right thumb: aim · hold FIRE and drag to aim while shooting 👉</span>
                </div>
              )}
              <div className="fps-rotate">📱↻ Turn your phone sideways for a wider view</div>
            </>
          )}
          {hud.status !== "LIVE" && (
            <div className="fps-center">
              <div className="modal">
                <div style={{ fontSize: 54 }}>{won ? "🏆" : "☠️"}</div>
                <h2 style={{ fontSize: 30, color: won ? "var(--yellow)" : "var(--red)" }}>{won ? "VICTORY" : "DEFEAT"}</h2>
                <p className="muted">
                  {hud.kind === "raid"
                    ? won ? "The boss is down. Loot goes to everyone who hit it." : "The boss survived — its damage stays, come back with a crew."
                    : hud.team === "A"
                      ? won ? "Base breached! Your share of the loot is in." : "The defense held."
                      : won ? "You held the base!" : "The base was breached."}
                </p>
                <p className="small">Kills: {hud.kills}</p>
                <button className="btn block" onClick={onExit}>Back to map</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
