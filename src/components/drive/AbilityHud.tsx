"use client";
// Two thin meters (focus = slow motion / dead-eye, nitro) that appear only while they're in use or
// still refilling. Painted straight into the DOM from the drive's frame loop: no React state.
// Styling is in controls.css (.ab-*), via CSS variables, so the HUD can be restyled freely.
import type { RefObject } from "react";
import { t } from "@/lib/i18n";
import type { Abilities } from "@/lib/abilities";

export function AbilityHud({ el }: { el: RefObject<HTMLDivElement | null> }) {
  return (
    <div className="ab-hud" ref={el} hidden aria-hidden>
      <div className="ab-meter focus">
        <i />
        <span>{t("FOCUS")}</span>
      </div>
      <div className="ab-meter nitro">
        <i />
        <span>{t("NITRO")}</span>
      </div>
    </div>
  );
}

const sigs = new WeakMap<HTMLElement, string>();
/** Update the meters (only touches the DOM when something changed by a visible step). */
export function paintAbilities(el: HTMLDivElement | null, a: Abilities, enabled: boolean) {
  if (!el) return;
  const f = Math.round(a.focus * 50), n = Math.round(a.nitro * 50);
  const show = enabled && (a.focusOn || a.nitroOn || f < 50 || n < 50);
  const sig = `${show}|${f}|${n}|${a.focusOn}|${a.nitroOn}|${a.focusLock}|${a.nitroLock}`;
  if (sigs.get(el) === sig) return;
  sigs.set(el, sig);
  el.hidden = !show;
  el.style.setProperty("--f", String(f / 50));
  el.style.setProperty("--n", String(n / 50));
  const [fm, nm] = [el.children[0], el.children[1]] as HTMLElement[];
  fm.classList.toggle("active", a.focusOn);
  fm.classList.toggle("lock", a.focusLock);
  nm.classList.toggle("active", a.nitroOn);
  nm.classList.toggle("lock", a.nitroLock);
  // Slow motion is a screen state too: CSS can tint the whole HUD (hooks on the parent).
  el.parentElement?.classList.toggle("slowmo", a.focusOn);
}
