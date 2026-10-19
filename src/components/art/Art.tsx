"use client";
// <Art k="coin" /> — one icon from the art kit, sized like text (1.2em) unless `size`
// is given. `anim` picks a motion from globals.css (float, spin, pop, pulse, wiggle).
import { useLayoutEffect, type CSSProperties } from "react";
import { ensureArt } from "./sprite";

export type ArtAnim = "float" | "spin" | "pop" | "pulse" | "wiggle" | "bounce";

export function Art({ k, size, anim, className = "", style, title }: { k: string; size?: number | string; anim?: ArtAnim; className?: string; style?: CSSProperties; title?: string }) {
  useLayoutEffect(() => ensureArt(k), [k]);
  const dim = size == null ? undefined : typeof size === "number" ? `${size}px` : size;
  return (
    <svg
      className={`art art-${k} ${anim ? `anim-${anim}` : ""} ${className}`}
      viewBox="0 0 64 64"
      style={dim ? { width: dim, height: dim, ...style } : style}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      data-art=""
    >
      <use href={`#art-${k}`} />
    </svg>
  );
}
