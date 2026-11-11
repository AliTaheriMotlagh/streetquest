// Line icons for the 3D city's HUD and controls: one 1.75 stroke, 24-unit grid, `currentColor`
// so CSS decides. Path data lives in lib/iconPaths.ts (the 3D marker atlas draws the same ones).
import type { SVGProps } from "react";
import { ICON_PATHS, type IconName } from "@/lib/iconPaths";

export type { IconName };

export function Icon({ name, size = 22, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" aria-hidden {...rest}>
      <path d={ICON_PATHS[name]} />
    </svg>
  );
}
