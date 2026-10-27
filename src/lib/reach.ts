// How close a player must be to pick money up or do a store mission (admin: Player reach).
import { S } from "./settings";

export let INTERACT_RADIUS_M = S.interactRadius;

/** Re-read the live admin settings (called by lib/config applyConfig). */
export function syncSettings() {
  INTERACT_RADIUS_M = S.interactRadius;
}
