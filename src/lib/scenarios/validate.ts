// Checks a scenario written by hand or in the admin editor (pure). Never throws: it returns
// every problem with where it is (`path`, e.g. "steps.2.at.lat") and a message to show with t().
import { msg } from "../i18n";
import { FLEET } from "../fleet";
import { ANCHOR_KINDS, LIMITS, PLACED, STEP_TYPES, STORE_KINDS, type Anchor, type CarSpec, type L10n, type Line, type Scenario, type Step } from "./types";

export type Issue = { path: string; message: string; vars?: Record<string, string | number> };
export type Checked = { ok: true; value: Scenario } | { ok: false; errors: Issue[] };

const M = {
  object: msg("This must be an object"),
  list: msg("This must be a list"),
  text: msg("Write text in both Persian and English"),
  tooLong: msg("Too long (at most {n} characters)"),
  id: msg("Use 3–40 letters, digits, dashes or underscores"),
  num: msg("Enter a number between {min} and {max}"),
  int: msg("Enter a whole number between {min} and {max}"),
  oneOf: msg("Pick one of the listed options"),
  noSteps: msg("Add at least one step"),
  tooMany: msg("At most {n} steps"),
  deliverFirst: msg("A delivery needs a pickup step before it"),
  pickupLast: msg("This pickup is never delivered — add a delivery step after it"),
  car: msg("Pick a car: any, or one of the street's models"),
  range: msg("The minimum must not be more than the maximum"),
  lines: msg("At most {n} lines of dialogue here"),
  emoji: msg("Pick one emoji"),
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

class Ctx {
  errors: Issue[] = [];
  add(path: string, message: string, vars?: Issue["vars"]) {
    this.errors.push({ path, message, vars });
  }
  num(v: unknown, path: string, min: number, max: number, opts: { int?: boolean; optional?: boolean } = {}) {
    if (v === undefined && opts.optional) return true;
    if (!isNum(v) || v < min || v > max || (opts.int && !Number.isInteger(v))) {
      this.add(path, opts.int ? M.int : M.num, { min, max });
      return false;
    }
    return true;
  }
  l10n(v: unknown, path: string, opts: { optional?: boolean; max?: number } = {}) {
    if (v === undefined && opts.optional) return;
    if (!isObj(v) || typeof v.fa !== "string" || typeof v.en !== "string" || !v.fa.trim() || !v.en.trim()) return void this.add(path, M.text);
    const max = opts.max ?? LIMITS.text;
    if (v.fa.length > max || v.en.length > max) this.add(path, M.tooLong, { n: max });
  }
  lines(v: unknown, path: string) {
    if (v === undefined) return;
    if (!Array.isArray(v)) return void this.add(path, M.list);
    if (v.length > LIMITS.lines) this.add(path, M.lines, { n: LIMITS.lines });
    v.forEach((l: Partial<Line>, i) => {
      if (!isObj(l)) return void this.add(`${path}.${i}`, M.object);
      this.l10n(l.speaker, `${path}.${i}.speaker`, { max: LIMITS.title });
      this.l10n(l.text, `${path}.${i}.text`);
      if (l.bark !== undefined && (typeof l.bark !== "string" || l.bark.length > 60)) this.add(`${path}.${i}.bark`, M.tooLong, { n: 60 });
    });
  }
  anchor(v: unknown, path: string) {
    if (!isObj(v) || !(ANCHOR_KINDS as readonly string[]).includes(v.at as string)) return void this.add(`${path}.at`, M.oneOf);
    const a = v as unknown as Anchor & { min?: number; max?: number; from?: string };
    if (a.at === "fixed") {
      this.num(a.lat, `${path}.lat`, -90, 90);
      this.num(a.lng, `${path}.lng`, -180, 180);
      return;
    }
    if (a.at === "start") return;
    if ("from" in a && a.from !== undefined && a.from !== "start" && a.from !== "prev") this.add(`${path}.from`, M.oneOf);
    if (a.at === "along") return void this.num(a.dist, `${path}.dist`, 50, LIMITS.rangeM);
    if (a.at === "store" && !(STORE_KINDS as readonly string[]).includes(a.kind)) this.add(`${path}.kind`, M.oneOf);
    const lo = this.num(a.min, `${path}.min`, 0, LIMITS.rangeM, { optional: true });
    const hi = this.num(a.max, `${path}.max`, 10, LIMITS.rangeM, { optional: true });
    if (lo && hi && a.min !== undefined && a.max !== undefined && a.min > a.max) this.add(`${path}.min`, M.range);
  }
  car(v: unknown, path: string) {
    const ok = (k: unknown) => typeof k === "string" && k in FLEET;
    if (v === "any" || ok(v) || (Array.isArray(v) && v.length > 0 && v.length <= 12 && v.every(ok))) return;
    this.add(path, M.car);
  }
}

const COMMON = ["type", "text", "timeLimitS", "checkpoint", "say"];
const STEP_KEYS: Record<string, string[]> = {
  goto: ["at", "radius"], car: ["car"], pickup: ["at", "radius", "what"], deliver: ["at", "radius"], chase: ["car", "startM", "escapeM"],
  evade: ["stars"], survive: ["seconds"], hostiles: ["count"], photo: ["at", "radius"], drift: ["meters"],
};
const TOP = ["id", "title", "brief", "emoji", "difficulty", "giver", "steps", "fail", "outro", "reward", "enabled"];
const pick = (o: Record<string, unknown>, keys: string[]) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

/** A copy with only the fields the format knows (the editor and old data may carry others). */
function clean(s: Scenario): Scenario {
  const out = pick(s as unknown as Record<string, unknown>, TOP);
  out.steps = s.steps.map((st) => pick(st as unknown as Record<string, unknown>, [...COMMON, ...STEP_KEYS[st.type]]));
  return JSON.parse(JSON.stringify(out)) as Scenario;
}

/** Check the whole scenario; on success the value is returned typed (extra fields are dropped). */
export function validateScenario(input: unknown): Checked {
  const c = new Ctx();
  if (!isObj(input)) return { ok: false, errors: [{ path: "", message: M.object }] };
  const s = input as Partial<Scenario> & Record<string, unknown>;
  if (typeof s.id !== "string" || !/^[\w-]{3,40}$/.test(s.id)) c.add("id", M.id);
  c.l10n(s.title, "title", { max: LIMITS.title });
  c.l10n(s.brief, "brief");
  if (typeof s.emoji !== "string" || !s.emoji.trim() || [...s.emoji].length > 4) c.add("emoji", M.emoji);
  if (s.difficulty !== 1 && s.difficulty !== 2 && s.difficulty !== 3) c.add("difficulty", M.oneOf);
  if (typeof s.enabled !== "boolean") c.add("enabled", M.oneOf);
  if (!isObj(s.giver)) c.add("giver", M.object);
  else {
    c.l10n(s.giver.name, "giver.name", { max: LIMITS.title });
    c.anchor(s.giver.at, "giver.at");
  }
  if (!isObj(s.reward)) c.add("reward", M.object);
  else {
    c.num(s.reward.coins, "reward.coins", 0, LIMITS.coins, { int: true });
    c.num(s.reward.xp, "reward.xp", 0, LIMITS.xp, { int: true });
  }
  if (s.fail !== undefined) {
    if (!isObj(s.fail)) c.add("fail", M.object);
    else {
      c.num(s.fail.timeLimitS, "fail.timeLimitS", 10, LIMITS.timeS, { int: true, optional: true });
      for (const k of ["carDestroyed", "playerDown"] as const) if (s.fail[k] !== undefined && typeof s.fail[k] !== "boolean") c.add(`fail.${k}`, M.oneOf);
    }
  }
  if (s.outro !== undefined) {
    if (!isObj(s.outro)) c.add("outro", M.object);
    else (c.lines(s.outro.won, "outro.won"), c.lines(s.outro.lost, "outro.lost"));
  }

  if (!Array.isArray(s.steps)) c.add("steps", M.list);
  else if (!s.steps.length) c.add("steps", M.noSteps);
  else {
    if (s.steps.length > LIMITS.steps) c.add("steps", M.tooMany, { n: LIMITS.steps });
    let carrying = false;
    s.steps.forEach((st: Step, i) => {
      const p = `steps.${i}`;
      if (!isObj(st) || !(STEP_TYPES as readonly string[]).includes(st.type)) return void c.add(`${p}.type`, M.oneOf);
      const x = st as Step & Record<string, unknown>;
      c.l10n(x.text, `${p}.text`, { optional: true });
      c.num(x.timeLimitS, `${p}.timeLimitS`, 5, LIMITS.timeS, { int: true, optional: true });
      if (x.checkpoint !== undefined && typeof x.checkpoint !== "boolean") c.add(`${p}.checkpoint`, M.oneOf);
      c.lines(x.say, `${p}.say`);
      if ((PLACED as readonly string[]).includes(x.type)) {
        c.anchor(x.at, `${p}.at`);
        c.num(x.radius, `${p}.radius`, 4, LIMITS.radius, { optional: true });
      }
      switch (x.type) {
        case "car":
          c.car(x.car, `${p}.car`);
          break;
        case "pickup":
          if (x.what !== "person" && x.what !== "package") c.add(`${p}.what`, M.oneOf);
          carrying = true;
          break;
        case "deliver":
          if (!carrying) c.add(p, M.deliverFirst);
          carrying = false;
          break;
        case "chase":
          if (x.car !== undefined) c.car(x.car, `${p}.car`);
          c.num(x.startM, `${p}.startM`, 30, 400, { optional: true });
          c.num(x.escapeM, `${p}.escapeM`, 80, 800, { optional: true });
          break;
        case "evade":
          c.num(x.stars, `${p}.stars`, 1, 5, { int: true });
          break;
        case "survive":
          c.num(x.seconds, `${p}.seconds`, 5, LIMITS.seconds, { int: true });
          break;
        case "hostiles":
          c.num(x.count, `${p}.count`, 1, LIMITS.count, { int: true });
          break;
        case "drift":
          c.num(x.meters, `${p}.meters`, 20, LIMITS.meters, { int: true });
          break;
      }
    });
    if (carrying) {
      const last = [...s.steps].reverse().findIndex((st) => st.type === "pickup");
      c.add(`steps.${s.steps.length - 1 - last}`, M.pickupLast);
    }
  }
  if (c.errors.length) return { ok: false, errors: c.errors };
  return { ok: true, value: clean(s as Scenario) };
}

/** The text of a bilingual field in this language (falls back to the other). */
export const say = (l: L10n | undefined, lang: string) => (l ? (lang === "fa" ? l.fa || l.en : l.en || l.fa) : "");

/** A car spec's list of model keys (empty: any). */
export const carKeys = (c: CarSpec | undefined): string[] => (!c || c === "any" ? [] : Array.isArray(c) ? c : [c]);
