// While you drive the 3D city, how often the car's position reaches the 2D game. Every commit
// re-renders the whole game underneath (hidden) — once a second that was a big share of the
// lag — while the 3D city reports to the server and picks things up on its own. Pure.
import { distanceM, type LatLng } from "@/lib/geo";

/** At most this often (ms)… */
export const DRIVE_COMMIT_MS = 5000;
/** …unless the car has gone this far (m). */
export const DRIVE_COMMIT_M = 150;

/** Commit `p` now (true), or keep it pending until the next one is due? `last`: the last committed spot. */
export const commitDue = (last: { p: LatLng; at: number } | null, p: LatLng, now: number) =>
  !last || now - last.at > DRIVE_COMMIT_MS || distanceM(last.p, p) > DRIVE_COMMIT_M;
