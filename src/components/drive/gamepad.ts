// Game controller input for the 3D city, driving and on foot (arena matches included).
// The mapping rules are pure (lib/input/gamepad.ts); this reads the browser's pad once a frame
// and writes into the SAME input state the keyboard and touch controls use (the drive's
// `input` ref, the soldier's CombatInput), so nothing downstream knows a pad exists.
//
//   Driving: left stick steer · R2 gas (analog) · L2 brake/reverse · L2+R2 focus (slow motion) ·
//            R1 nitro · B/○ handbrake · A/✕ get out · Y/△ camera · Start menu ·
//            D-pad up horn, down land, left/right camera
//   On foot: left stick move · right stick look · R2 fire · L2 aim · L1 dead-eye · A/✕ jump ·
//            X/□ reload · B/○ crouch · Y/△ get in · L3 sprint · R1 throw · D-pad up camera, left
//            switch gun, right switch throwable, down plant/defuse (hold) · Start menu
import { t } from "@/lib/i18n";
import { PAD_LOOK_RAD_S, padActive, padKind, padNames, pressed, readPad, type PadFrame, type PadHeld, type PadKind } from "@/lib/input/gamepad";
import type { Combat } from "../arena/combat";
import type { Controls } from "./physics";

/** The drive's input ref (what the keyboard and the touch pad write). */
export type DriveInput = Controls & { focus: boolean; nitro: boolean };

type Ctx = {
  input: DriveInput;
  combat: Combat;
  flies: boolean;
  menuOpen: () => boolean;
  onMenu: () => void;
  cycleCam: () => void;
  horn: (on: boolean) => void;
  land: () => void;
  toast: (text: string) => void;
  /** Look sensitivity multiplier (0.5…2). */
  sens: () => number;
};

type Rumble = { playEffect: (type: string, p: { duration: number; startDelay?: number; weakMagnitude: number; strongMagnitude: number }) => Promise<unknown> };
let live: Gamepad | null = null;

/** A short rumble (crash, shot, hit). Quietly does nothing without a pad or without support. */
export function rumble(strong: number, weak: number, ms: number) {
  try {
    const act = (live as (Gamepad & { vibrationActuator?: Rumble }) | null)?.vibrationActuator;
    // The browser keeps it going for `duration`, so keep it short: a crash is a thump, not a buzz.
    void act?.playEffect("dual-rumble", { duration: ms, strongMagnitude: Math.min(1, strong), weakMagnitude: Math.min(1, weak) });
  } catch {}
}

/** The pad's name in the player's language, for the connect toast ("Xbox", "PlayStation", ...). */
const KIND_NAME: Record<PadKind, string> = { xbox: "Xbox", playstation: "PlayStation", switch: "Switch", generic: "" };

export class PadPoller {
  private prev: PadHeld | null = null;
  /** True once a pad did something recently: until then the keyboard keeps the foot controls. */
  active = false;
  private idle = 0;
  private sprintOn = false;
  private hornOn = false;
  private throwOn = false;
  private index = -1;
  kind: PadKind = "generic";
  private ctx: Ctx | null = null;
  private onConn = (e: GamepadEvent) => {
    if (e.gamepad.mapping !== "standard" && e.gamepad.buttons.length < 16) return;
    this.index = e.gamepad.index;
    live = e.gamepad;
    this.kind = padKind(e.gamepad.id);
    const n = padNames(this.kind);
    const name = KIND_NAME[this.kind];
    this.ctx?.toast(name ? t("🎮 {name} controller connected — {jump} jump · {car} car", { name, jump: n.south, car: n.north }) : t("🎮 Controller connected — {jump} jump · {car} car", { jump: n.south, car: n.north }));
  };
  private onDisc = (e: GamepadEvent) => {
    if (e.gamepad.index !== this.index) return;
    this.index = -1;
    live = null;
    this.ctx?.toast(t("🎮 Controller disconnected"));
    this.releaseAll();
  };

  start() {
    window.addEventListener("gamepadconnected", this.onConn);
    window.addEventListener("gamepaddisconnected", this.onDisc);
    // A pad that was already plugged in before the page loaded shows up after its first press.
  }
  stop() {
    window.removeEventListener("gamepadconnected", this.onConn);
    window.removeEventListener("gamepaddisconnected", this.onDisc);
    this.releaseAll();
    live = null;
  }

  private releaseAll() {
    const c = this.ctx;
    this.active = false;
    this.prev = null;
    this.sprintOn = this.throwOn = false;
    if (!c) return;
    Object.assign(c.input, { gas: 0, brake: 0, steer: 0, lift: 0, hand: false, focus: false, nitro: false });
    Object.assign(c.combat.input, { mx: 0, mz: 0, sprint: false, fire: false, aim: false, act: false });
    c.combat.padOn = false;
    if (this.hornOn) c.horn(false), (this.hornOn = false);
  }

  private snapshot(): Gamepad | null {
    const pads = navigator.getGamepads?.();
    if (!pads) return null;
    const mine = this.index >= 0 ? pads[this.index] : null;
    if (mine?.connected) return mine;
    // Chrome gives a pad only after a button press and fires the event then; Safari may skip it: adopt the first one.
    for (const p of pads)
      if (p?.connected && (p.mapping === "standard" || p.buttons.length >= 16)) {
        this.index = p.index;
        this.kind = padKind(p.id);
        return p;
      }
    return null;
  }

  /** Once per frame, with the real (unscaled) frame time. */
  poll(ctx: Ctx, dt: number) {
    this.ctx = ctx;
    const pad = this.snapshot();
    if (!pad) return;
    live = pad;
    const f = readPad({ id: pad.id, axes: pad.axes, buttons: pad.buttons });
    const edges = pressed(this.prev, f.held);
    const wasHeld = this.prev;
    this.prev = f.held;
    const used = padActive(f);
    if (used) this.idle = 0;
    else this.idle += dt;
    const was = this.active;
    // Active while used, and for a couple of seconds after (so a thumb off the stick doesn't flip the keyboard on mid-turn).
    this.active = used || this.idle < 2;
    if (!this.active) {
      if (was) this.releaseAll();
      return;
    }
    const c = ctx.combat;
    c.padOn = true;
    if (edges.includes("start")) ctx.onMenu();
    if (ctx.menuOpen()) return;
    if (c.onFoot) this.foot(ctx, f, edges, wasHeld, dt);
    else this.drive(ctx, f, edges);
  }

  private drive(ctx: Ctx, f: PadFrame, edges: ReturnType<typeof pressed>) {
    const i = ctx.input;
    const both = f.l2 > 0.5 && f.r2 > 0.5;
    // L2 + R2 together is the slow-motion button: keep rolling (the throttle wins) instead of braking against yourself.
    i.gas = f.r2;
    i.brake = both ? 0 : f.l2;
    i.steer = -f.move.x;
    i.hand = f.held.east;
    i.lift = ctx.flies ? f.look.y + (f.held.r1 ? 1 : 0) - (f.held.l1 ? 1 : 0) : 0;
    i.focus = both;
    i.nitro = !ctx.flies && f.held.r1;
    if (this.hornOn !== f.held.up) ctx.horn((this.hornOn = f.held.up));
    if (edges.includes("south")) {
      if (ctx.combat.canRespawn) ctx.combat.respawn();
      else ctx.combat.getOut();
    }
    if (edges.includes("north") || edges.includes("left") || edges.includes("right")) ctx.cycleCam();
    if (edges.includes("down")) ctx.land();
  }

  private foot(ctx: Ctx, f: PadFrame, edges: ReturnType<typeof pressed>, was: PadHeld | null, dt: number) {
    const c = ctx.combat, inp = c.input;
    inp.mx = f.move.x;
    inp.mz = f.move.y;
    if (edges.includes("l3")) this.sprintOn = !this.sprintOn;
    // Sprint ends when you let go of the stick (and is only forward, which stepFoot enforces).
    if (Math.hypot(f.move.x, f.move.y) < 0.2) this.sprintOn = false;
    inp.sprint = this.sprintOn;
    inp.fire = f.held.r2;
    inp.aim = f.held.l2;
    inp.act = f.held.down;
    // Right stick: a rate (radians per second), slowed in the sights like the mouse.
    const k = PAD_LOOK_RAD_S * dt * ctx.sens() * c.lookScale();
    inp.lookX += f.look.x * k;
    inp.lookY -= f.look.y * k;
    if (edges.includes("south")) {
      if (c.canRespawn) c.respawn();
      else c.jump();
    }
    if (edges.includes("west")) c.reload();
    if (edges.includes("east")) inp.crouch = !inp.crouch;
    if (edges.includes("north")) c.getIn();
    if (edges.includes("up")) c.toggleCam();
    if (edges.includes("left")) c.swap();
    if (edges.includes("right")) c.cycleThrow();
    if (f.held.r1 !== !!was?.r1) c.holdThrow((this.throwOn = f.held.r1));
    ctx.input.focus = f.held.l1;
  }
}
