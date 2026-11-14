// Loads the admin's game settings from the database and applies them to this
// server instance. Cached briefly so it costs ~nothing per request; saving in the
// admin panel invalidates this instance immediately (others catch up within TTL).
import { prisma } from "../lib/db";
import { applyConfig } from "../lib/config";
import { S, sanitizeSettings, type Settings } from "../lib/settings";

const TTL_MS = 15_000;
let loadedAt = 0;
let overrides: Partial<Settings> = {};
/** When the admin last saved (ms): /api/sync hands it out, and a client that sees it change reloads its settings. */
let version = 0;
let inflight: Promise<void> | null = null;

export async function ensureSettings() {
  if (Date.now() - loadedAt < TTL_MS) return S;
  inflight ??= prisma.gameConfig
    .findUnique({ where: { id: "main" } })
    .then((row) => {
      overrides = sanitizeSettings(row?.data ?? {});
      version = row?.updatedAt.getTime() ?? 0;
      applyConfig(overrides);
      loadedAt = Date.now();
    })
    .catch(() => {
      // Table missing (first deploy) or DB hiccup: keep the current values, retry soon.
      loadedAt = Date.now() - TTL_MS + 3000;
    })
    .finally(() => {
      inflight = null;
    });
  await inflight;
  return S;
}

/** The settings' version (the last admin save, ms; 0: never saved) — at most TTL_MS stale on another instance. */
export async function settingsVersion() {
  await ensureSettings();
  return version;
}

/** The overrides only (what the client needs to reproduce S). */
export async function settingOverrides() {
  await ensureSettings();
  return overrides;
}

export async function saveSettings(data: unknown, by: string) {
  const clean = sanitizeSettings(data);
  const row = await prisma.gameConfig.upsert({ where: { id: "main" }, create: { id: "main", data: clean as object, updatedBy: by }, update: { data: clean as object, updatedBy: by } });
  version = row.updatedAt.getTime();
  overrides = clean;
  applyConfig(clean);
  loadedAt = Date.now();
  return clean;
}
