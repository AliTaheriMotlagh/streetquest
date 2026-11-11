"use client";
// The one hook between the loaders and the admin's published model replacements (Admin →
// Objects): before a built-in .glb is fetched, ask the manifest (/api/models, fetched once per
// session) whether its slot has been replaced and take that address instead. Any failure —
// offline, slow, no such slot — leaves the built-in file, so a model never waits on this for
// more than a moment and the game never depends on it.
import { slotOfUrl } from "@/lib/modelCheck";

type Manifest = Record<string, { url: string; version: number }>;
let manifest: Promise<Manifest> | null = null;
/** Longest the first model waits for the manifest. */
const WAIT_MS = 1500;

function load(): Promise<Manifest> {
  manifest ??= fetch("/api/models")
    .then((r) => (r.ok ? r.json() : { models: {} }))
    .then((d: { models?: Manifest }) => d.models ?? {})
    .catch(() => ({}) as Manifest);
  return manifest;
}

/** The address to load for a built-in model file: its published replacement, or the file itself. */
export async function modelUrl(builtin: string): Promise<string> {
  const slot = slotOfUrl(builtin);
  if (!slot || typeof fetch === "undefined") return builtin;
  const m = await Promise.race([load(), new Promise<Manifest>((r) => setTimeout(() => r({}), WAIT_MS))]);
  return m[slot]?.url ?? builtin;
}

/** Forget the manifest (the admin's preview after a publish). */
export const refreshModelManifest = () => (manifest = null);
