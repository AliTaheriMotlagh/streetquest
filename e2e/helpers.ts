// Shared helpers: each test plays as its own fresh guest commander, somewhere random on
// the map so bases, towers and flags never collide between tests running in parallel.
import { request, type APIRequestContext } from "@playwright/test";
import { ADMIN_KEY } from "../playwright.config";

export type LatLng = { lat: number; lng: number };
export type Res<T = Record<string, unknown>> = { status: number; data: T & { error?: string; message?: string } };

const octet = () => Math.floor(Math.random() * 250) + 1;
/** Every player looks like their own network, so the per-IP guest cap never trips. */
const fakeIp = () => `10.${octet()}.${octet()}.${octet()}`;

/** A random spot on land-ish latitudes, far from every other test's spot. */
export const randomSpot = (): LatLng => ({ lat: -50 + Math.random() * 110, lng: -170 + Math.random() * 340 });

/** Move `m` metres north/east of a point. */
export const offset = (p: LatLng, northM: number, eastM = 0): LatLng => ({
  lat: p.lat + northM / 111_320,
  lng: p.lng + eastM / (111_320 * Math.cos((p.lat * Math.PI) / 180)),
});

export class Player {
  private constructor(public ctx: APIRequestContext, public username: string) {}

  /** A brand-new guest commander (optionally carrying extra cookies, e.g. a referral). */
  static async create(baseURL: string, opts: { cookies?: Record<string, string>; ip?: string } = {}) {
    const domain = new URL(baseURL).hostname;
    const cookies = Object.entries(opts.cookies ?? {}).map(([name, value]) => ({ name, value, domain, path: "/", expires: -1, httpOnly: false, secure: false, sameSite: "Lax" as const }));
    const ctx = await request.newContext({ baseURL, extraHTTPHeaders: { "x-forwarded-for": opts.ip ?? fakeIp() }, storageState: { cookies, origins: [] } });
    const r = await ctx.post("/api/auth/guest", { data: {} });
    if (!r.ok()) throw new Error(`guest signup failed: ${r.status()} ${await r.text()}`);
    const p = new Player(ctx, (await r.json()).username);
    return p;
  }

  async get<T = Record<string, unknown>>(path: string): Promise<Res<T>> {
    const r = await this.ctx.get(path);
    return { status: r.status(), data: await r.json().catch(() => ({})) };
  }

  async post<T = Record<string, unknown>>(path: string, body: unknown = {}, method: "POST" | "PATCH" = "POST"): Promise<Res<T>> {
    const r = await this.ctx.fetch(path, { method, data: body });
    return { status: r.status(), data: await r.json().catch(() => ({})) };
  }

  me() {
    return this.get<Me>("/api/me").then((r) => r.data);
  }

  /** Test-mode position report (dev servers allow simulated GPS for everyone). */
  async goTo(p: LatLng) {
    const r = await this.post("/api/loc", { ...p, sim: true });
    if (r.status !== 200) throw new Error(`move failed: ${r.status} ${JSON.stringify(r.data)}`);
    return r;
  }

  async dispose() {
    await this.ctx.dispose();
  }
}

export type Me = {
  id: string;
  username: string;
  coins: number;
  gems: number;
  xp: number;
  role: string;
  faction: string | null;
  base: { id: string; lat: number; lng: number } | null;
  dailyAvailable: boolean;
  hp: number;
  maxHp: number;
  inventory: { key: string; qty: number }[];
};

/** An admin player (promoted through the real /admin?key= flow). */
export async function adminPlayer(baseURL: string) {
  const a = await Player.create(baseURL);
  const r = await a.ctx.get(`/admin?key=${ADMIN_KEY}`, { maxRedirects: 0 });
  if (![200, 307, 308].includes(r.status())) throw new Error(`admin promotion failed: ${r.status()}`);
  if ((await a.me()).role !== "ADMIN") throw new Error("admin promotion didn't stick");
  return a;
}

/** Give a player coins/gems through the admin API. */
export async function fund(admin: Player, userId: string, coins: number, gems = 0) {
  if (coins) expectOk(await admin.post("/api/admin", { action: "grant", userId, coins, xp: 0 }));
  if (gems) expectOk(await admin.post("/api/admin", { action: "grantGems", userId, gems }));
}

export function expectOk(r: Res) {
  if (r.status !== 200) throw new Error(`expected 200, got ${r.status}: ${JSON.stringify(r.data)}`);
  return r;
}
