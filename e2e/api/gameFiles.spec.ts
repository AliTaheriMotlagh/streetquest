// The game's files to download (/api/game-files, lib/gameDownload.ts): every model, the 3D decoder,
// fonts and sounds with their real sizes, one version for the set — no sign-in, nothing else listed.
import { expect, test } from "@playwright/test";

type GameFiles = { version: string; files: { u: string; b: number }[] };

test("the game's files: what the 3D city loads, with sizes and a version", async ({ request }) => {
  const res = await request.get("/api/game-files");
  expect(res.ok()).toBeTruthy();
  const g = (await res.json()) as GameFiles;
  expect(g.version).toMatch(/^[0-9a-f]{12}$/);
  const paths = g.files.map((f) => f.u);
  expect(paths).toContain("/draco/draco_decoder.wasm");
  expect(paths.some((u) => u.startsWith("/models/cars/") && u.endsWith(".glb"))).toBeTruthy();
  expect(paths.some((u) => u.startsWith("/sounds/voice/") && u.endsWith(".mp3"))).toBeTruthy();
  // Only the four folders, only what the game loads (no licence texts), every size real.
  for (const f of g.files) {
    expect(f.u).toMatch(/^\/(models|draco|fonts|sounds)\//);
    expect(f.u).not.toMatch(/\.(txt|md)$/);
    expect(f.b).toBeGreaterThan(0);
  }
  // A listed file is served at that path, at that size.
  const one = g.files.find((f) => f.u.endsWith(".glb"))!;
  const file = await request.get(one.u);
  expect(file.ok()).toBeTruthy();
  expect((await file.body()).length).toBe(one.b);
});
