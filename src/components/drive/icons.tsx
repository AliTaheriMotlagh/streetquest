// Line icons for the 3D city's HUD and controls: one stroke weight, drawn on a 24-unit
// grid, coloured by `currentColor` so CSS decides.
import type { SVGProps } from "react";

const PATHS = {
  back: "M15 5l-7 7 7 7",
  map: "M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Zm0 0v13m6-10.5v13",
  camera: "M4 8h3l2-3h6l2 3h3v11H4V8Zm8 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z",
  menu: "M4 7h16M4 12h16M4 17h10",
  horn: "M4 10v4h3l6 4V6L7 10H4Zm12.5-1.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12",
  hand: "M7.5 7.5a6.5 6.5 0 0 0 0 9m9-9a6.5 6.5 0 0 1 0 9M10 16V8h2.5a2.2 2.2 0 0 1 0 4.4H10",
  land: "M12 4v10m-4-4 4 4 4-4M5 19h14",
  up: "M6 15l6-6 6 6",
  down: "M6 9l6 6 6-6",
  left: "M14 6l-6 6 6 6",
  right: "M10 6l6 6-6 6",
  nav: "M12 3 19 20l-7-4-7 4 7-17Z",
  box: "M12 3 4 7v10l8 4 8-4V7l-8-4Zm-8 4 8 4 8-4M12 11v10",
  check: "M5 12.5l4.5 4.5L19 7.5",
  flag: "M6 21V4m0 1h11l-2 4 2 4H6",
  tilt: "M7 4h10a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Zm4 13h2M2.5 9a10 10 0 0 0 0 6m19-6a10 10 0 0 1 0 6",
  wheel: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM3.3 10.5l6.3 1M14.4 11.5l6.3-1M12 14.5V21",
  pad: "M5 9h4v6H5zM15 9h4v6h-4z",
  people: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm-6 9a6 6 0 0 1 12 0m1.5-9a3 3 0 1 0 0-6m1.5 15h3a5 5 0 0 0-4-4.9",
  list: "M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01",
  garage: "M3 10 12 4l9 6v10H3V10Zm4 10v-6h10v6M7 17h10",
  store: "M4 9.5 5.5 4h13L20 9.5M4 9.5a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 0 5.3 0M5 11.5V20h14v-8.5M10 20v-5h4v5",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 22, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      <path d={PATHS[name]} />
    </svg>
  );
}
