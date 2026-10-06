"use client";
// First-person fight (Counter-Strike / CoD style), rendered with three.js.
// Netcode: POST our position + scored hits to /api/match/:id every ~140 ms and
// get the whole match back. If we're the elected host we also drive the bots.
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { blocked, buildArena, collide, EYE, RIFLE, type Pt } from "@/lib/arena";
import type { MatchView } from "@/server/match";
import { api } from "../game/client";

type Player = MatchView["players"][number];
type Hud = {
  hp: number;
  maxHp: number;
  ammo: number;
  reloading: boolean;
  timeLeft: number;
  capture: number;
  captureNeeded: number;
  alive: { A: number; D: number };
  feed: { t: number; text: string }[];
  status: string;
  winner: string | null;
  team: string;
  kind: string;
  boss: { name: string; emoji: string; hp: number; maxHp: number } | null;
  hit: boolean;
  hurt: boolean;
  inZone: boolean;
  kills: number;
  locked: boolean;
};

type Actor = {
  key: string;
  row: Player;
  group: THREE.Group;
  hitboxes: THREE.Mesh[];
  pos: { x: number; z: number; yaw: number };
  target: { x: number; z: number; yaw: number };
  label: { ctx: CanvasRenderingContext2D; tex: THREE.CanvasTexture; hp: number };
};

type Input = { keys: Set<string>; joy: { x: number; y: number }; look: { dx: number; dy: number }; firing: boolean; reload: boolean };

const FRIEND = 0x22e3ff;
const ENEMY = 0xff4d4d;
const TICK_MS = 140;
const touchDevice = () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches;

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

function makeActor(p: Player, friendly: boolean, bossColor?: string): Actor {
  const group = new THREE.Group();
  const isBoss = p.key === "boss";
  const color = isBoss ? new THREE.Color(bossColor ?? "#ff4d4d").getHex() : friendly ? FRIEND : ENEMY;
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: color, emissiveIntensity: 0.15 });
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.35, 0.45), mat);
  body.position.y = 0.68;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0xf1d3b3, roughness: 0.8 }));
  head.position.y = 1.6;
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.1, 0.1), new THREE.MeshBasicMaterial({ color: isBoss ? 0xffd23f : 0x111111 }));
  visor.position.set(0, 1.63, -0.2);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
  gun.position.set(0.32, 1.05, -0.35);
  group.add(body, head, visor, gun);
  body.userData = { key: p.key, head: false };
  head.userData = { key: p.key, head: true };
  if (isBoss) {
    // Heavy armor: shoulder plates, glowing eyes and twin arm cannons.
    const armor = new THREE.MeshStandardMaterial({ color: 0x2b2b33, metalness: 0.6, roughness: 0.4 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xffd23f });
    for (const side of [-1, 1]) {
      const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.55), armor);
      shoulder.position.set(side * 0.5, 1.28, 0);
      const cannon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.8), armor);
      cannon.position.set(side * 0.55, 0.9, -0.35);
      const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.02), glow);
      eye.position.set(side * 0.09, 1.64, -0.21);
      group.add(shoulder, cannon, eye);
    }
    group.remove(gun);
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

  const a: Actor = { key: p.key, row: p, group, hitboxes: [body, head], pos: { x: p.x, z: p.z, yaw: p.yaw }, target: { x: p.x, z: p.z, yaw: p.yaw }, label: { ctx: canvas.getContext("2d")!, tex, hp: -1 } };
  return a;
}

export default function Fps({ matchId, onExit }: { matchId: string; onExit: () => void }) {
  const mount = useRef<HTMLDivElement>(null);
  const input = useRef<Input>({ keys: new Set(), joy: { x: 0, y: 0 }, look: { dx: 0, dy: 0 }, firing: false, reload: false });
  const [hud, setHud] = useState<Hud | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [touch] = useState(touchDevice);
  const joyKnob = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let net: ReturnType<typeof setInterval> | undefined;
    let hudTimer: ReturnType<typeof setInterval> | undefined;
    const cleanups: (() => void)[] = [];

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
      const me = { x: mine.x, z: mine.z, yaw: mine.yaw, pitch: 0, hp: mine.hp, maxHp: mine.maxHp, team: mine.team };
      const st = { ammo: RIFLE.mag, reloadUntil: 0, lastShot: 0, hitUntil: 0, hurtUntil: 0, kick: 0, hits: [] as { key: string; dmg: number }[], botHits: [] as { from: string; key: string; dmg: number }[], inflight: false, ended: false, offset: view.serverTime - Date.now() };

      // ---- renderer / scene
      const renderer = new THREE.WebGLRenderer({ antialias: !touch, powerPreference: "high-performance" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, touch ? 1.5 : 2));
      renderer.setSize(el.clientWidth, el.clientHeight);
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const sky = view.kind === "raid" ? 0x1a0b10 : 0x0d1220;
      scene.background = new THREE.Color(sky);
      scene.fog = new THREE.Fog(sky, 25, 80);
      scene.add(new THREE.HemisphereLight(0xbfd4ff, 0x20202a, 1.1));
      const sun = new THREE.DirectionalLight(0xffffff, 1.4);
      sun.position.set(20, 40, 10);
      scene.add(sun);

      const H = arena.half;
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(H * 2, H * 2), new THREE.MeshStandardMaterial({ color: view.kind === "raid" ? 0x2a1c1c : 0x1c1f2b, roughness: 0.95 }));
      floor.rotation.x = -Math.PI / 2;
      scene.add(floor);
      const grid = new THREE.GridHelper(H * 2, 32, 0x3a3f55, 0x2a2e3f);
      grid.position.y = 0.01;
      scene.add(grid);

      const wallMeshes: THREE.Mesh[] = [];
      for (const b of arena.walls) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), new THREE.MeshStandardMaterial({ color: b.color, roughness: 0.8 }));
        m.position.set(b.x, b.h / 2, b.z);
        scene.add(m);
        wallMeshes.push(m);
      }
      if (arena.core) {
        const flag = new THREE.Mesh(new THREE.BoxGeometry(0.15, 3, 0.15), new THREE.MeshStandardMaterial({ color: 0xcccccc }));
        flag.position.set(arena.core.x, arena.core.h + 1.5, arena.core.z);
        const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.05), new THREE.MeshBasicMaterial({ color: me.team === "D" ? FRIEND : ENEMY }));
        cloth.position.set(arena.core.x + 0.75, arena.core.h + 2.6, arena.core.z);
        scene.add(flag, cloth);
      }
      if (arena.zone) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(arena.zone.r - 0.25, arena.zone.r, 48), new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(arena.zone.x, 0.03, arena.zone.z);
        const glow = new THREE.Mesh(new THREE.CylinderGeometry(arena.zone.r, arena.zone.r, 0.6, 48, 1, true), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
        glow.position.set(arena.zone.x, 0.3, arena.zone.z);
        scene.add(ring, glow);
      }

      const camera = new THREE.PerspectiveCamera(touch ? 80 : 75, el.clientWidth / el.clientHeight, 0.05, 200);
      camera.rotation.order = "YXZ";
      scene.add(camera);
      // Gun viewmodel + muzzle flash
      const gun = new THREE.Group();
      const gm = new THREE.MeshStandardMaterial({ color: 0x2b2d36, roughness: 0.5, metalness: 0.4 });
      const gBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.5), gm);
      const gBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.3), gm);
      gBarrel.position.set(0, 0.02, -0.38);
      const gMag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.08), new THREE.MeshStandardMaterial({ color: 0x8a6a3a }));
      gMag.position.set(0, -0.12, -0.05);
      gun.add(gBody, gBarrel, gMag);
      gun.scale.setScalar(0.7);
      gun.position.set(0.24, -0.24, -0.55);
      camera.add(gun);
      const flash = new THREE.PointLight(0xffc860, 0, 6);
      flash.position.set(0.22, -0.18, -1);
      camera.add(flash);
      const flashSprite = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 }));
      flashSprite.position.set(0, 0.02, -0.56);
      gun.add(flashSprite);

      // ---- other players / bots / boss
      const actors = new Map<string, Actor>();
      const sims = new Map<string, { x: number; z: number; yaw: number; nextShot: number; side: number }>();
      let host = view.host;
      const syncActors = (v: MatchView) => {
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
          const visible = p.hp > 0 && !p.gone;
          a.group.visible = visible;
          if (a.label.hp !== p.hp) {
            a.label.hp = p.hp;
            drawLabel(a, p.name, p.hp / p.maxHp, p.team === me.team ? "#22e3ff" : "#ff4d4d");
          }
        }
      };
      syncActors(view);

      // ---- tracers
      const tracers: { line: THREE.Line; until: number }[] = [];
      const tracer = (from: THREE.Vector3, to: THREE.Vector3, color: number) => {
        const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([from, to]), new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 }));
        scene.add(line);
        tracers.push({ line, until: performance.now() + 70 });
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
      const onResize = () => {
        renderer.setSize(el.clientWidth, el.clientHeight);
        camera.aspect = el.clientWidth / el.clientHeight;
        camera.updateProjectionMatrix();
      };
      window.addEventListener("resize", onResize);
      cleanups.push(() => {
        window.removeEventListener("keydown", kd);
        window.removeEventListener("keyup", ku);
        window.removeEventListener("mousemove", mm);
        window.removeEventListener("mouseup", mu);
        window.removeEventListener("resize", onResize);
        if (document.pointerLockElement) document.exitPointerLock();
      });

      // ---- shooting
      const ray = new THREE.Raycaster();
      ray.far = RIFLE.range;
      const ndc = new THREE.Vector2();
      const muzzle = new THREE.Vector3();
      const shoot = (now: number, moving: boolean) => {
        st.lastShot = now;
        st.ammo--;
        st.kick = 1;
        me.pitch = Math.min(1.4, me.pitch + 0.006);
        const spread = moving ? 0.035 : 0.01;
        ndc.set((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread);
        ray.setFromCamera(ndc, camera);
        const enemies = [...actors.values()].filter((a) => a.row.team !== me.team && a.row.hp > 0 && a.group.visible).flatMap((a) => a.hitboxes);
        const hit = ray.intersectObjects([...wallMeshes, ...enemies], false)[0];
        gBarrel.getWorldPosition(muzzle);
        const end = hit ? hit.point : ray.ray.at(RIFLE.range, new THREE.Vector3());
        tracer(muzzle, end, 0xffe08a);
        const key = hit?.object.userData.key as string | undefined;
        if (key) {
          st.hits.push({ key, dmg: RIFLE.dmg * (hit!.object.userData.head ? RIFLE.headMult : 1) });
          st.hitUntil = now + 140;
          navigator.vibrate?.(10);
        }
        if (st.ammo <= 0) st.reloadUntil = now + RIFLE.reloadMs;
      };

      // ---- host-side bot AI
      const humanTargets = (): (Pt & { key: string })[] => {
        const out: (Pt & { key: string })[] = [];
        if (me.team === "A" && me.hp > 0) out.push({ key: view.me, x: me.x, z: me.z });
        for (const a of actors.values()) if (!a.row.bot && a.row.team === "A" && a.row.hp > 0 && !a.row.gone) out.push({ key: a.key, x: a.pos.x, z: a.pos.z });
        return out;
      };
      const runBots = (dt: number, now: number) => {
        const targets = humanTargets();
        for (const a of actors.values()) {
          if (!a.row.bot || a.row.hp <= 0) continue;
          let s = sims.get(a.key);
          if (!s) sims.set(a.key, (s = { x: a.pos.x, z: a.pos.z, yaw: a.pos.yaw, nextShot: now + 1200 + Math.random() * 800, side: Math.random() < 0.5 ? -1 : 1 }));
          const isBoss = a.key === "boss";
          let best: (Pt & { key: string }) | null = null;
          let bd = Infinity;
          for (const t of targets) {
            const d = Math.hypot(t.x - s.x, t.z - s.z);
            if (d < bd) [best, bd] = [t, d];
          }
          if (!best) continue;
          const los = !blocked(s, best, arena.walls);
          const speed = isBoss ? (view.boss?.speed ?? 2.5) : 3.2;
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
            s.nextShot = now + (isBoss ? 650 : 900 + Math.random() * 700);
            const chance = isBoss ? 0.55 : Math.max(0.15, 0.55 - bd / 60);
            const landed = Math.random() < chance;
            const dmg = isBoss ? (view.boss?.dmg ?? 15) : 8 + Math.round(Math.random() * 6);
            if (landed) st.botHits.push({ from: a.key, key: best.key, dmg });
            const from = new THREE.Vector3(s.x, isBoss ? 2.6 : 1.1, s.z);
            const to = new THREE.Vector3(best.x + (landed ? 0 : (Math.random() - 0.5) * 2), 1.2, best.z + (landed ? 0 : (Math.random() - 0.5) * 2));
            tracer(from, to, 0xff6060);
          }
          a.target = { x: s.x, z: s.z, yaw: s.yaw };
        }
      };

      // ---- network
      const apply = (v: MatchView) => {
        view = v;
        if (v.host && !host) sims.clear();
        host = v.host;
        const row = v.players.find((p) => p.key === v.me);
        if (row) {
          if (row.hp < me.hp) st.hurtUntil = performance.now() + 250;
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
        const bots = host ? [...sims.entries()].map(([key, s]) => ({ key, x: s.x, z: s.z, yaw: s.yaw })) : undefined;
        try {
          apply(await api<MatchView>(`/api/match/${matchId}`, { body: { x: me.x, z: me.z, yaw: me.yaw, inZone, hits, botHits, bots } }));
        } catch {
          // transient network error: keep playing, next tick retries
        } finally {
          st.inflight = false;
        }
      }, TICK_MS);

      hudTimer = setInterval(() => {
        const now = performance.now();
        const alive = { A: 0, D: 0 };
        for (const p of view.players) if (p.hp > 0 && !p.gone) alive[p.team as "A" | "D"]++;
        const b = view.players.find((p) => p.key === "boss");
        setHud({
          hp: me.hp,
          maxHp: me.maxHp,
          ammo: st.ammo,
          reloading: st.reloadUntil > now,
          timeLeft: Math.max(0, Math.round((view.endsAt - (Date.now() + st.offset)) / 1000)),
          capture: view.capture,
          captureNeeded: view.captureNeeded,
          alive,
          feed: view.feed,
          status: view.status,
          winner: view.winner,
          team: me.team,
          kind: view.kind,
          boss: b && view.boss ? { name: view.boss.name, emoji: view.boss.emoji, hp: b.hp, maxHp: b.maxHp } : null,
          hit: st.hitUntil > now,
          hurt: st.hurtUntil > now,
          inZone: !!arena.zone && Math.hypot(me.x - arena.zone.x, me.z - arena.zone.z) <= arena.zone.r,
          kills: view.players.find((p) => p.key === view.me)?.kills ?? 0,
          locked: touch || document.pointerLockElement === renderer.domElement,
        });
      }, 100);

      // ---- frame loop
      let last = performance.now();
      const frame = (now: number) => {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        const inp = input.current;
        const sens = touch ? 0.006 : 0.0024;
        me.yaw -= inp.look.dx * sens;
        me.pitch = Math.max(-1.3, Math.min(1.3, me.pitch - inp.look.dy * sens));
        inp.look.dx = inp.look.dy = 0;

        const alive = me.hp > 0 && !st.ended;
        let fwd = 0;
        let strafe = 0;
        if (alive) {
          const k = inp.keys;
          fwd = (k.has("w") || k.has("arrowup") ? 1 : 0) - (k.has("s") || k.has("arrowdown") ? 1 : 0) - inp.joy.y;
          strafe = (k.has("d") || k.has("arrowright") ? 1 : 0) - (k.has("a") || k.has("arrowleft") ? 1 : 0) + inp.joy.x;
          const mag = Math.hypot(fwd, strafe);
          if (mag > 1) [fwd, strafe] = [fwd / mag, strafe / mag];
          const speed = inp.keys.has("shift") ? 7.5 : 5.5;
          const sin = Math.sin(me.yaw);
          const cos = Math.cos(me.yaw);
          const next = collide({ x: me.x + (-sin * fwd + cos * strafe) * speed * dt, z: me.z + (-cos * fwd - sin * strafe) * speed * dt }, arena.walls);
          me.x = next.x;
          me.z = next.z;

          if (inp.reload && st.ammo < RIFLE.mag && st.reloadUntil <= now) st.reloadUntil = now + RIFLE.reloadMs;
          inp.reload = false;
          if (st.reloadUntil && st.reloadUntil <= now) {
            st.reloadUntil = 0;
            st.ammo = RIFLE.mag;
          }
          if (inp.firing && !st.reloadUntil && st.ammo > 0 && now - st.lastShot >= RIFLE.intervalMs) shoot(now, Math.hypot(fwd, strafe) > 0.1);
        }
        if (host && !st.ended) runBots(dt, now);

        const k = 1 - Math.exp(-dt * 12);
        for (const a of actors.values()) {
          a.pos.x += (a.target.x - a.pos.x) * k;
          a.pos.z += (a.target.z - a.pos.z) * k;
          let dy = a.target.yaw - a.pos.yaw;
          dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          a.pos.yaw += dy * k;
          a.group.position.set(a.pos.x, 0, a.pos.z);
          a.group.rotation.y = a.pos.yaw;
        }

        const bob = alive && Math.hypot(fwd, strafe) > 0.1 ? Math.sin(now / 90) * 0.03 : 0;
        camera.position.set(me.x, alive ? EYE + bob : 0.5, me.z);
        camera.rotation.set(me.pitch, me.yaw, alive ? 0 : 0.4);
        st.kick *= 0.8;
        gun.position.z = -0.55 + st.kick * 0.05;
        gun.visible = alive;
        const flashOn = now - st.lastShot < 45;
        flash.intensity = flashOn ? 3 : 0;
        (flashSprite.material as THREE.MeshBasicMaterial).opacity = flashOn ? 1 : 0;
        flashSprite.rotation.z = Math.random() * Math.PI;

        for (let i = tracers.length - 1; i >= 0; i--) {
          if (tracers[i].until < now) {
            scene.remove(tracers[i].line);
            tracers[i].line.geometry.dispose();
            tracers.splice(i, 1);
          }
        }
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(frame);

      cleanups.push(() => {
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose();
          const mat = m.material as THREE.Material | THREE.Material[] | undefined;
          (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => x.dispose());
        });
        renderer.dispose();
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

  // ---- touch controls: left = move stick, right = drag to aim
  const stick = useRef<{ id: number; x: number; y: number } | null>(null);
  const lookPtr = useRef<{ id: number; x: number; y: number } | null>(null);
  const onStick = (e: React.PointerEvent, phase: "down" | "move" | "up") => {
    const inp = input.current;
    if (phase === "down") {
      (e.target as Element).setPointerCapture(e.pointerId);
      stick.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
    if (!stick.current || stick.current.id !== e.pointerId) return;
    if (phase === "up") {
      stick.current = null;
      inp.joy = { x: 0, y: 0 };
    } else {
      const dx = e.clientX - stick.current.x;
      const dy = e.clientY - stick.current.y;
      const len = Math.min(50, Math.hypot(dx, dy));
      const a = Math.atan2(dy, dx);
      inp.joy = { x: (Math.cos(a) * len) / 50, y: (Math.sin(a) * len) / 50 };
    }
    if (joyKnob.current) joyKnob.current.style.transform = `translate(${inp.joy.x * 40}px, ${inp.joy.y * 40}px)`;
  };
  const onLook = (e: React.PointerEvent, phase: "down" | "move" | "up") => {
    if (phase === "down") {
      (e.target as Element).setPointerCapture(e.pointerId);
      lookPtr.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    if (!lookPtr.current || lookPtr.current.id !== e.pointerId) return;
    if (phase === "up") lookPtr.current = null;
    else {
      input.current.look.dx += e.clientX - lookPtr.current.x;
      input.current.look.dy += e.clientY - lookPtr.current.y;
      lookPtr.current = { id: e.pointerId, x: e.clientX, y: e.clientY };
    }
  };
  const fire = (on: boolean) => (e: React.PointerEvent) => {
    e.stopPropagation();
    input.current.firing = on;
  };

  const won = hud?.winner === hud?.team;
  const objective =
    hud?.kind === "raid"
      ? "Take down the boss before time runs out"
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
          <div className={`fps-cross ${hud.hit ? "hit" : ""}`} />
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
              <div className="fps-bar boss">
                <i style={{ width: `${(hud.boss.hp / hud.boss.maxHp) * 100}%` }} />
                <span>{hud.boss.emoji} {hud.boss.name} · {hud.boss.hp.toLocaleString()} HP</span>
              </div>
            )}
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
            <div className="fps-ammo">{hud.reloading ? "RELOADING" : <><b>{hud.ammo}</b> / {RIFLE.mag}</>}</div>
          </div>
          <button className="fps-leave" onClick={onExit}>✕ Leave</button>
          {!hud.locked && hud.status === "LIVE" && (
            <div className="fps-help">
              <b>Click to fight</b>
              <span>WASD move · Shift sprint · Mouse aim · Click shoot · R reload · Esc release</span>
            </div>
          )}
          {hud.hp <= 0 && hud.status === "LIVE" && <div className="fps-down">💀 You&apos;re down — no respawns this round</div>}
          {touch && hud.status === "LIVE" && (
            <>
              <div className="fps-look" onPointerDown={(e) => onLook(e, "down")} onPointerMove={(e) => onLook(e, "move")} onPointerUp={(e) => onLook(e, "up")} onPointerCancel={(e) => onLook(e, "up")} />
              <div className="fps-joy" onPointerDown={(e) => onStick(e, "down")} onPointerMove={(e) => onStick(e, "move")} onPointerUp={(e) => onStick(e, "up")} onPointerCancel={(e) => onStick(e, "up")}>
                <div ref={joyKnob} />
              </div>
              <button className="fps-fire" onPointerDown={fire(true)} onPointerUp={fire(false)} onPointerCancel={fire(false)} onPointerLeave={fire(false)}>FIRE</button>
              <button className="fps-reload" onPointerDown={(e) => { e.stopPropagation(); input.current.reload = true; }}>R</button>
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
