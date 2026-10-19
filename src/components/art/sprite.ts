"use client";
// The shared SVG sprite: one hidden <svg> holding the materials and, added on first
// use, each icon as a <symbol>. Every icon on screen is a tiny <use href="#art-…">.
import { ICONS } from "./icons";
import { materialDefs, render } from "./kit";

const NS = "http://www.w3.org/2000/svg";
let sprite: SVGSVGElement | null = null;
const added = new Set<string>();

function root() {
  if (sprite?.isConnected) return sprite;
  added.clear();
  sprite = document.createElementNS(NS, "svg");
  sprite.setAttribute("aria-hidden", "true");
  sprite.setAttribute("data-art", "");
  // Not display:none — gradients inside a hidden sprite don't paint in some browsers.
  sprite.setAttribute("style", "position:absolute;width:0;height:0;overflow:hidden;pointer-events:none");
  sprite.innerHTML = `<defs>${materialDefs()}</defs>`;
  document.body.prepend(sprite);
  return sprite;
}

/** Make sure these icons exist in the sprite. Unknown keys are ignored. */
export function ensureArt(...keys: string[]) {
  if (typeof document === "undefined") return;
  let html = "";
  for (const k of keys) {
    if (added.has(k) || !ICONS[k]) continue;
    added.add(k);
    html += `<symbol id="art-${k}" viewBox="0 0 64 64" overflow="visible">${render(ICONS[k])}</symbol>`;
  }
  if (html) root().insertAdjacentHTML("beforeend", html);
  else root();
}

export const hasArt = (k: string) => !!ICONS[k];
