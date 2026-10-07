// Loads the admin's game settings from the database and applies them to this
// server instance. Cached briefly so it costs ~nothing per request; saving in the
// admin panel invalidates this instance immediately (others catch up within TTL).
import { prisma } from "../lib/db";
import { applyConfig } from "../lib/config";
import { S, sanitizeSettings, type Settings } from "../lib/settings";

const TTL_MS = 15_000;
let loadedAt = 0;
let overrides: Partial<Settings> = {};
let inflight: Promise<void> | null = null;

export async function ensureSettings() {
  if (Date.now() - loadedAt < TTL_MS) return S;
  inflight ??= prisma.gameConfig
    .findUnique({ where: { id: "main" } })
    .then((row) => {
      overrides = sanitizeSettings(row?.data ?? {});
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

/** The overrides only (what the client needs to reproduce S). */
export async function settingOverrides() {
  await ensureSettings();
  return overrides;
}

export async function saveSettings(data: unknown, by: string) {
  const clean = sanitizeSettings(data);
  await prisma.gameConfig.upsert({ where: { id: "main" }, create: { id: "main", data: clean as object, updatedBy: by }, update: { data: clean as object, updatedBy: by } });
  overrides = clean;
  applyConfig(clean);
  loadedAt = Date.now();
  return clean;
}
