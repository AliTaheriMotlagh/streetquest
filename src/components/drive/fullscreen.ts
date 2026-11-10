"use client";
// The wide view: the 3D city full screen with the phone on its side, like a console game.
// Android can do both from a tap; an iPhone has no full-screen for pages — there the
// player just turns the phone (the city fits whatever shape it gets).

export const canFullscreen = () => typeof document !== "undefined" && !!document.fullscreenEnabled && !!document.documentElement.requestFullscreen;
export const isFullscreen = () => typeof document !== "undefined" && !!document.fullscreenElement;

type Lockable = ScreenOrientation & { lock?: (o: "landscape") => Promise<void> };

/** Into (or out of) full screen; on phones that allow it, turned to landscape. Call from a tap. */
export async function setFullscreen(on: boolean) {
  try {
    if (on) {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      // Desktop browsers refuse (nothing to turn): fine.
      await (screen.orientation as Lockable | undefined)?.lock?.("landscape").catch(() => {});
    } else {
      try {
        screen.orientation?.unlock?.();
      } catch {}
      if (document.fullscreenElement) await document.exitFullscreen();
    }
  } catch {}
}

/** Tell `f` whenever full screen starts or ends (Esc and the back gesture end it too). */
export function onFullscreenChange(f: () => void) {
  document.addEventListener("fullscreenchange", f);
  return () => document.removeEventListener("fullscreenchange", f);
}
