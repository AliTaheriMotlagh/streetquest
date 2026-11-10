// The film look's numbers for one frame of the 3D city: how much motion blur, sun shafts,
// lens flare, colour fringing, grain and split toning, from how fast the player goes, which
// camera they look through, the time of day and the weather. Pure — the drive feeds the
// result to the renderer's grade (graphics/post.ts), tests drive it directly.

export type FilmIn = {
  /** 0 standing … 1 flat out. */
  speedK: number;
  camera: "chase" | "far" | "top" | "cockpit" | "foot";
  /** 0 day … 1 night. */
  night: number;
  /** 0 clear … 1 overcast. */
  overcast: number;
  /** Height of the sun in the sky: 0 on the horizon … 1 overhead (its direction's y). */
  sunHeight: number;
  /** The cartoon city has no film look. */
  toon?: boolean;
};
export type FilmOut = { motionBlur: number; rays: number; flare: number; aberration: number; grain: number; split: number };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function filmLook(i: FilmIn): FilmOut {
  if (i.toon) return { motionBlur: 0, rays: 0, flare: 0, aberration: 0, grain: 0, split: 0 };
  const speed = clamp01(i.speedK), night = clamp01(i.night), overcast = clamp01(i.overcast);
  // Blur grows with speed (none while standing: turning the camera at a stop stays crisp).
  // Behind the wheel the dashboard fills the view and a smeared road makes people queasy:
  // much less. From straight above nothing streaks towards you; on foot, a trace.
  const cam = i.camera === "chase" ? 1 : i.camera === "far" ? 0.7 : i.camera === "cockpit" ? 0.35 : i.camera === "top" ? 0.25 : 0.3;
  const motionBlur = cam * (0.15 + 0.6 * speed * speed) * (i.camera === "foot" ? 1 : clamp01(speed * 6));
  // The sun's shafts need a sun: none at night (the moon lights too little to scatter), none
  // under a closed sky; strongest when it stands low and the air glows.
  const sun = clamp01(1 - night * 1.6) * clamp01(1 - overcast * 1.4);
  const low = 1 - clamp01((i.sunHeight - 0.12) / 0.6);
  const rays = sun * (0.25 + 0.55 * low);
  return {
    motionBlur,
    rays,
    flare: sun * (0.35 + 0.35 * low),
    aberration: 0.25 + 0.75 * speed * speed,
    grain: 0.022 + 0.03 * night + 0.012 * overcast,
    split: 0.55 - 0.2 * overcast,
  };
}
