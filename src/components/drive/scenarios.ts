"use client";
// Story scenarios in the open 3D city (the format and rules: lib/scenarios/*; the server: api/scenarios).
// This is the thin layer between the pure state machine and the game:
//  - mission givers stand on the streets around you as beacons (the same ones jobs use); driving or walking
//    into one opens the briefing card; the places of the scenario are resolved around where you stand;
//  - while it runs, every frame hands the machine what is happening (where I am, what I drive, the wanted
//    stars, the chase car) and does what it asks: spawn the chase car (traffic.pin), raise the wanted level
//    (street.forceStars — the police come by themselves), move the waypoint, play dialogue (subtitles, and
//    the recorded street line when the step names one);
//  - the HUD (ScenarioHud.tsx) reads a tiny store: the card, the objective with its clock and distance,
//    the subtitle. Nothing runs while an arena match is on.
import * as THREE from "three";
import type { Frame } from "@/lib/city";
import { getLocale, t } from "@/lib/i18n";
import { barkById } from "@/lib/street/barks";
import { resolveScenario, type Probe } from "@/lib/scenarios/anchors";
import { abandon, hud as machineHud, newRun, retry as retryRun, start as startRun, tick as tickRun, type Effect, type FailReason, type Run, type Signals } from "@/lib/scenarios/machine";
import { carKeys, say } from "@/lib/scenarios/validate";
import { DEFAULT_OBJECTIVE } from "@/lib/scenarios/text";
import type { CarSpec, Line, Pt, Scenario } from "@/lib/scenarios/types";
import { api } from "../game/client";
import type { StreetLife } from "./street";
import type { TrafficCars, CarRef } from "./traffic";
import { forward } from "./physics";
import { peekScenario, takeScenario } from "./scenarioLink";
import { type TileMeshes } from "./world3d";
import { makeBeacon } from "./markerKit";

/** A scenario as the server sends it. */
export type Offered = Scenario & { done: boolean; paidNow: boolean };

export type ScenarioHost = {
  scene: THREE.Scene;
  frame: Frame;
  street: StreetLife;
  traffic: TrafficCars;
  tiles: () => TileMeshes[];
  /** The nearest street spot within `d` m of (x, z). */
  snap: (x: number, z: number, d: number) => { x: number; z: number } | null;
  lite: boolean;
  /** Pay-out toast and a refresh of the player's wallet. */
  rewarded: (r: { xp: number; coins: number }, title: string) => void;
  toast: (title: string) => void;
  /** In a simulation (tests): nothing is sent to the server. */
  sim: boolean;
};

/** What Drive tells the runtime every frame. */
export type ScenarioMe = { x: number; z: number; vx: number; vz: number; yaw: number; onFoot: boolean; inCar: boolean; carKey: string | null; matchOn: boolean; flying: boolean };

export type ScenarioCard =
  | { kind: "intro"; scn: Offered }
  | { kind: "end"; won: boolean; title: string; reason: FailReason | null; reward: { xp: number; coins: number } | null; message: string; canResume: boolean };

export type ScenarioView = {
  card: ScenarioCard | null;
  hud: { title: string; objective: string; left: number | null; dist: number | null; progress: { have: number; need: number; unit: "m" | "s" | "n" } | null; index: number; total: number; carrying: boolean } | null;
  subtitle: { id: number; speaker: string; text: string } | null;
  /** Bumped when a photo is taken (the flash) and when a checkpoint is reached. */
  flash: number;
  checkpoint: number;
  busy: boolean;
};

/** A small seeded generator: a giver stays where it was while you stay around, and a run is repeatable in tests. */
function seeded(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) (h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)), (h = (h << 13) | (h >>> 19));
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

const STORE_CLS: Record<string, RegExp> = {
  any: /./,
  food: /^(restaurant|fast_food|food_court|cafe|bakery|ice_cream|confectionery|pastry|deli|juice|coffee|burger|pizza|icecream)$/,
  cafe: /^(cafe|coffee|tea)$/,
  bakery: /^(bakery|pastry|confectionery)$/,
  pharmacy: /^(pharmacy|chemist)$/,
  supermarket: /^(supermarket|convenience|grocery|greengrocer)$/,
  fuel: /^fuel$/,
  bank: /^(bank|atm)$/,
  electronics: /^(mobile_phone|electronics|computer)$/,
  clothes: /^(clothes|clothing_store|shoes|boutique|fashion)$/,
};

const GIVER_RADIUS = 14, GIVER_RESET_M = 1800;
const SUB_MIN_S = 2.6;

export class Scenarios {
  private offered: Offered[] = [];
  private loaded = false;
  private givers = new Map<string, { at: Pt; key: string; beacon: ReturnType<typeof makeBeacon> }>();
  private goal: ReturnType<typeof makeBeacon> | null = null;
  private run: Run | null = null;
  private runId: string | null = null;
  private target: CarRef | null = null;
  private wantTarget: { car: CarSpec | undefined; ahead: number } | null = null;
  private busts0 = 0;
  private took: string | null = null;
  private dialogue: { line: Line; at: number }[] = [];
  private sub = { until: 0, id: 0 };
  private subtitle: ScenarioView["subtitle"] = null;
  private card: ScenarioCard | null = null;
  private dismissedAt = new Map<string, number>();
  private flash = 0;
  private cpFlash = 0;
  private busy = false;
  private syncAt = -Infinity;
  private fetched = -Infinity;
  private sig = "";
  private snapshot: ScenarioView = { card: null, hud: null, subtitle: null, flash: 0, checkpoint: 0, busy: false };
  private listeners = new Set<() => void>();
  private clock = 0;
  private junctions: { at: number; pts: Pt[] } = { at: -1, pts: [] };
  private lastMe: ScenarioMe | null = null;
  /** Off while a match is on, in a simulation, or switched off by the server. */
  enabled = true;

  constructor(private h: ScenarioHost) {}

  // ------------------------------------------------------------ store for the HUD
  subscribe = (l: () => void) => (this.listeners.add(l), () => void this.listeners.delete(l));
  getSnapshot = () => this.snapshot;

  private publish(m = this.lastMe) {
    const run = this.run;
    let hud: ScenarioView["hud"] = null;
    if (run && !run.result && m) {
      const lang = getLocale();
      const h = machineHud(run, { x: m.x, z: m.z, kills: this.h.street.kills, target: this.targetSignal() });
      if (h) hud = { title: say(run.scn.title, lang), objective: h.step.text ? say(h.step.text, lang) : t(DEFAULT_OBJECTIVE[h.step.type]), left: h.left, dist: h.dist == null ? null : Math.round(h.dist), progress: h.progress, index: h.index, total: h.total, carrying: !!run.carrying };
    }
    const s: ScenarioView = { card: this.card, hud, subtitle: this.subtitle, flash: this.flash, checkpoint: this.cpFlash, busy: this.busy };
    const sig = JSON.stringify({ ...s, card: this.card && this.card.kind + (this.card.kind === "end" ? this.card.message : this.card.scn.id) });
    if (sig === this.sig) return;
    this.sig = sig;
    this.snapshot = s;
    for (const l of this.listeners) l();
  }

  // ------------------------------------------------------------ the world's streets, for anchors
  private probe(): Probe {
    const h = this.h;
    const roads = () => {
      if (this.clock - this.junctions.at < 6) return this.junctions.pts;
      // A junction: a point three or more street ends/crossings meet at.
      const count = new Map<string, { n: number; x: number; z: number }>();
      for (const m of h.tiles()) {
        m.roads.forEach((line, li) => {
          const k = m.roadKinds[li];
          if (k === "foot" || k === "rail") return;
          for (let i = 0; i + 1 < line.length; i += 2) {
            const key = `${Math.round(line[i] / 5)}_${Math.round(line[i + 1] / 5)}`;
            const e = count.get(key) ?? { n: 0, x: line[i], z: line[i + 1] };
            e.n += i === 0 || i + 3 >= line.length ? 1 : 2;
            count.set(key, e);
          }
        });
      }
      this.junctions = { at: this.clock, pts: [...count.values()].filter((e) => e.n >= 3).map((e) => ({ x: e.x, z: e.z })) };
      return this.junctions.pts;
    };
    const pick = (pts: Pt[], from: Pt, min: number, max: number, rand: () => number) => {
      const ring = pts.filter((p) => {
        const d = Math.hypot(p.x - from.x, p.z - from.z);
        return d >= min && d <= max;
      });
      return ring.length ? ring[Math.floor(rand() * ring.length)] : null;
    };
    return {
      toXZ: (lat, lng) => h.frame.toXZ(lat, lng),
      junction: (from, min, max, rand) => pick(roads(), from, min, max, rand),
      store: (kind, from, min, max, rand) => {
        const re = STORE_CLS[kind] ?? STORE_CLS.any;
        const shops: Pt[] = [];
        for (const m of h.tiles()) for (const l of m.labels) if (l.kind === "shop" && re.test(l.cls ?? "")) shops.push({ x: l.x, z: l.z });
        const p = pick(shops, from, min, max, rand);
        return p ? h.snap(p.x, p.z, 60) ?? p : null;
      },
      landmark: (from, min, max, rand) => {
        const named: Pt[] = [];
        for (const m of h.tiles()) for (const l of m.labels) if (l.kind === "building" && l.text) named.push({ x: l.x, z: l.z });
        const p = pick(named, from, min, max, rand);
        return p ? h.snap(p.x, p.z, 80) ?? p : null;
      },
      snap: (p, d) => h.snap(p.x, p.z, d),
    };
  }

  // ------------------------------------------------------------ list and givers
  async load(test?: string | null) {
    if (this.h.sim) return;
    try {
      const r = await api<{ scenarios: Offered[] }>(`/api/scenarios${test ? `?test=${encodeURIComponent(test)}` : ""}`);
      this.offered = r.scenarios;
      this.loaded = true;
      this.fetched = performance.now();
      for (const g of this.givers.values()) this.removeGiver(g);
      this.givers.clear();
    } catch {
      this.loaded = false;
    }
  }

  private removeGiver(g: { beacon: ReturnType<typeof makeBeacon> }) {
    this.h.scene.remove(g.beacon.group);
    g.beacon.dispose();
  }

  /** Keep a giver beacon for each of the nearest scenarios; put them again when you've driven far. */
  private syncGivers(me: ScenarioMe) {
    const cell = `${Math.round(me.x / GIVER_RESET_M)}_${Math.round(me.z / GIVER_RESET_M)}`;
    const want = this.offered.slice(0, this.h.lite ? 3 : 6);
    for (const s of want) {
      const have = this.givers.get(s.id);
      const fixed = s.giver.at.at === "fixed";
      if (have && (have.key === cell || fixed)) continue;
      if (have) (this.removeGiver(have), this.givers.delete(s.id));
      const p = resolveScenario({ ...s, steps: [] }, me, this.probe(), seeded(`${s.id}:${cell}`)).giver;
      const beacon = makeBeacon("flag", "#ffb020", `${say(s.title, getLocale())} · ${say(s.giver.name, getLocale())}`);
      beacon.group.position.set(p.x, 0, p.z);
      this.h.scene.add(beacon.group);
      this.givers.set(s.id, { at: p, key: cell, beacon });
    }
    for (const [id, g] of this.givers) if (!want.some((s) => s.id === id)) (this.removeGiver(g), this.givers.delete(id));
  }

  // ------------------------------------------------------------ starting, resuming, ending
  /** Open a scenario's briefing (a giver reached, a link followed). */
  open(id: string) {
    const scn = this.offered.find((s) => s.id === id);
    if (scn && !this.run && !this.card) (this.card = { kind: "intro", scn }), this.publish();
  }

  dismiss() {
    if (this.card?.kind === "intro") this.dismissedAt.set(this.card.scn.id, this.clock);
    this.card = null;
    this.publish();
  }

  /** Accept the mission: resolve its places around where I stand, tell the server, begin. */
  async accept() {
    const m = this.lastMe, c = this.card;
    if (!m || c?.kind !== "intro" || this.busy) return;
    const scn = c.scn;
    this.busy = true;
    this.publish();
    try {
      const origin = { x: m.x, z: m.z };
      const placed = resolveScenario(scn, origin, this.probe(), seeded(`${scn.id}:${Date.now()}`));
      if (!this.h.sim) {
        const ll = (p: Pt) => this.h.frame.toLatLng(p.x, p.z);
        // The giver the server compares is where the scenario would put it, so a standing giver is only reported when pinned.
        const r = await api<{ runId: string }>("/api/scenarios", { body: { action: "start", id: scn.id, giver: ll(placed.giver), places: placed.places.map((p) => (p ? ll(p) : null)) } });
        this.runId = r.runId;
      }
      this.begin(scn, placed.places);
    } catch (e) {
      this.card = null;
      this.h.toast(e instanceof Error ? e.message : t("Couldn't start the scenario"));
    }
    this.busy = false;
    this.publish();
  }

  private begin(scn: Scenario, places: (Pt | null)[]) {
    this.run = newRun(scn, places);
    this.busts0 = this.h.street.busts;
    this.card = null;
    const m = this.lastMe!;
    this.apply(startRun(this.run, this.signals(m)), m);
    for (const g of this.givers.values()) g.beacon.group.visible = false;
  }

  /** After a failure: from the last checkpoint if there is one, else the whole thing again from here. */
  async retry() {
    const run = this.run, m = this.lastMe;
    if (!run || !m || !run.result || this.busy) return;
    this.card = null;
    if (run.cp) {
      this.cleanupActors();
      this.apply(retryRun(run, this.signals(m)), m);
      this.publish();
      return;
    }
    // No checkpoint: a fresh run (new places around where I am now, a new server run).
    const scn = run.scn;
    this.run = null;
    this.clearGoal();
    const offered = this.offered.find((s) => s.id === scn.id);
    if (offered) {
      this.card = { kind: "intro", scn: offered };
      await this.accept();
    }
  }

  quit() {
    const run = this.run;
    if (run && this.runId && run.cp && run.result === "failed") void this.report("failed", run, true);
    this.finishUp();
  }

  private finishUp() {
    this.cleanupActors();
    this.clearGoal();
    this.run = null;
    this.runId = null;
    this.card = null;
    this.dialogue = [];
    this.subtitle = null;
    this.publish();
  }

  /** Cancel a run in progress (a match started, the player left). */
  stop() {
    if (this.run && !this.run.result) {
      abandon(this.run);
      if (this.runId && !this.h.sim) void api("/api/scenarios", { body: { action: "abandon", runId: this.runId } }).catch(() => {});
    }
    this.finishUp();
  }

  private async report(result: "won" | "failed", run: Run, quiet = false) {
    const id = this.runId;
    if (!id || this.h.sim) return null;
    try {
      return await api<{ status: string; reward: { xp: number; coins: number } | null; message: string }>("/api/scenarios", { body: { action: "finish", runId: id, result, elapsedS: run.t, travelledM: run.travelled, reason: run.reason ?? undefined } });
    } catch (e) {
      if (!quiet) return { status: "ERROR", reward: null, message: e instanceof Error ? e.message : t("Couldn't send the result") };
      return null;
    }
  }

  // ------------------------------------------------------------ actors and effects
  private cleanupActors() {
    if (this.target) (this.h.traffic.unpin(this.target), (this.target = null));
    this.wantTarget = null;
  }

  private clearGoal() {
    if (!this.goal) return;
    this.h.scene.remove(this.goal.group);
    this.goal.dispose();
    this.goal = null;
  }

  private setGoal(p: Pt | null) {
    this.clearGoal();
    if (!p) return;
    this.goal = makeBeacon("target", "#5bd38c", t("Objective"));
    this.goal.group.position.set(p.x, 0, p.z);
    this.h.scene.add(this.goal.group);
  }

  private say(lines: Line[]) {
    for (const l of lines) this.dialogue.push({ line: l, at: 0 });
  }

  private apply(effects: Effect[], m: ScenarioMe) {
    const run = this.run!;
    for (const e of effects) {
      switch (e.kind) {
        case "step":
          this.cleanupActors();
          break;
        case "say":
          this.say(e.lines);
          break;
        case "waypoint":
          this.setGoal(e.at);
          break;
        case "stars":
          this.h.street.forceStars(e.n);
          break;
        case "spawnHostiles":
          this.h.street.forceStars(3);
          break;
        case "spawnTarget":
          this.wantTarget = { car: e.car, ahead: e.ahead };
          this.trySpawn(m);
          break;
        case "photo":
          this.flash++;
          break;
        case "checkpoint":
          this.cpFlash++;
          break;
        case "end":
          this.ended(run, e.result, e.reason);
          break;
      }
    }
  }

  /** The chase car: the nearest moving car ahead of the right model, else any (tried again for a few seconds). */
  private trySpawn(m: ScenarioMe) {
    const w = this.wantTarget;
    if (!w || this.target) return;
    const f = forward(m.yaw);
    const keys = carKeys(w.car);
    this.target = this.h.traffic.pin(m.x, m.z, f.fx, f.fz, w.ahead, keys) ?? (keys.length ? this.h.traffic.pin(m.x, m.z, f.fx, f.fz, w.ahead, []) : null);
    if (this.target) this.wantTarget = null;
  }

  private ended(run: Run, result: "won" | "failed", reason: FailReason | null) {
    this.cleanupActors();
    const title = say(run.scn.title, getLocale());
    if (result === "won") {
      this.busy = true;
      this.card = { kind: "end", won: true, title, reason: null, reward: null, message: t("Scenario complete"), canResume: false };
      void this.report("won", run).then((r) => {
        this.busy = false;
        const reward = r?.reward ?? null;
        if (this.card?.kind === "end") this.card = { ...this.card, reward, message: r?.message ?? this.card.message };
        if (reward) this.h.rewarded(reward, title);
        this.publish();
      });
    } else {
      // With a checkpoint the run stays open so a retry continues it; without, it's over for the server too.
      if (!run.cp) void this.report("failed", run, true);
      this.card = { kind: "end", won: false, title, reason, reward: null, message: "", canResume: !!run.cp };
    }
  }

  // ------------------------------------------------------------ per frame
  private targetSignal(): Signals["target"] {
    return this.target ? this.h.traffic.pinState(this.target) : null;
  }

  private signals(m: ScenarioMe): Signals {
    const f = forward(m.yaw), s = this.h.street;
    const took = this.took;
    this.took = null;
    return {
      x: m.x, z: m.z, fx: f.fx, fz: f.fz, vx: m.vx, vz: m.vz, onFoot: m.onFoot, inCar: m.inCar, carKey: m.carKey, tookCar: took,
      carWrecked: s.carWrecked, down: s.busts > this.busts0 || this.down(), stars: s.wanted.stars, kills: s.kills, target: this.targetSignal(),
    };
  }

  private down = () => false;
  /** Drive: the player is knocked out right now (combat.streetDown). */
  setDown(fn: () => boolean) {
    this.down = fn;
  }

  /** I got into a street car of this model (Drive's takeCar). */
  tookCar(key: string) {
    this.took = key;
  }

  /** The waypoint for the nav arrow (lat/lng), or null. */
  waypoint(): { lat: number; lng: number } | null {
    const run = this.run;
    if (!run || run.result) return null;
    const t0 = this.targetSignal();
    const p = run.places[run.i] ?? (t0 ? { x: t0.x, z: t0.z } : null);
    return p ? this.h.frame.toLatLng(p.x, p.z) : null;
  }

  /** Dots for the minimap. */
  dots(): { x: number; z: number; color: string }[] {
    const out: { x: number; z: number; color: string }[] = [];
    if (this.run && !this.run.result) {
      const p = this.run.places[this.run.i];
      if (p) out.push({ ...p, color: "#5bd38c" });
      const t0 = this.targetSignal();
      if (t0 && !t0.wrecked) out.push({ x: t0.x, z: t0.z, color: "#ff5a5a" });
    } else if (!this.card) for (const g of this.givers.values()) out.push({ ...g.at, color: "#ffb020" });
    return out;
  }

  get active() {
    return !!this.run && !this.run.result;
  }

  tick(dt: number, time: number, me: ScenarioMe) {
    this.lastMe = me;
    this.clock += dt;
    if (!this.enabled || this.h.sim) return;
    // A match is on: nothing of this runs, and a run in progress is called off.
    if (me.matchOn) {
      if (this.run || this.card) this.stop();
      for (const g of this.givers.values()) g.beacon.group.visible = false;
      return;
    }
    const run = this.run;
    if (run && !run.result) {
      this.trySpawn(me);
      this.apply(tickRun(run, dt, this.signals(me)), me);
      this.goal?.tick(time);
      this.talk(dt, me);
      this.publish(me);
      return;
    }
    for (const g of this.givers.values()) (g.beacon.group.visible = !this.run), g.beacon.tick(time);
    this.talk(dt, me);
    if (run) return void this.publish(me);
    // The list, once; the admin's test link opens its briefing.
    if (!this.loaded) {
      if (!this.busy && performance.now() - this.fetched > 5000) ((this.fetched = performance.now()), void this.load(peekScenario()));
      return;
    }
    const link = takeScenario();
    if (link && this.offered.some((s) => s.id === link)) {
      this.syncGivers(me);
      this.open(link);
    }
    if (this.clock - this.syncAt > 1) {
      this.syncAt = this.clock;
      this.syncGivers(me);
    }
    // Stepping into a giver's marker opens its briefing (not again for a minute after "not now").
    if (!this.card && !me.flying && Math.hypot(me.vx, me.vz) < 14) {
      for (const [id, g] of this.givers) {
        if (Math.hypot(g.at.x - me.x, g.at.z - me.z) > GIVER_RADIUS) continue;
        if (this.clock - (this.dismissedAt.get(id) ?? -Infinity) < 60) continue;
        this.open(id);
        break;
      }
    }
    this.publish(me);
  }

  /** The dialogue, a line at a time: its subtitle, and the recorded street line when it names one. */
  private talk(dt: number, me: ScenarioMe) {
    void dt;
    if (this.subtitle && this.clock < this.sub.until) return;
    if (this.subtitle) this.subtitle = null;
    const next = this.dialogue.shift();
    if (!next) return;
    const lang = getLocale(), text = say(next.line.text, lang);
    this.sub = { until: this.clock + Math.max(SUB_MIN_S, text.length * 0.075), id: this.sub.id + 1 };
    this.subtitle = { id: this.sub.id, speaker: say(next.line.speaker, lang), text };
    const b = next.line.bark ? barkById(next.line.bark) : null;
    if (b) this.h.street.bark(b.id, () => ({ x: me.x, y: 2, z: me.z }));
  }

  dispose() {
    this.stop();
    for (const g of this.givers.values()) this.removeGiver(g);
    this.givers.clear();
    this.listeners.clear();
  }
}
