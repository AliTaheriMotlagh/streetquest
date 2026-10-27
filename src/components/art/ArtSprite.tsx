// Server-rendered art: the sprite for a fixed set of icons, inline in the HTML, so a page
// without much JavaScript (the home page) shows its icons on first paint instead of
// waiting for hydration. Use <ArtSprite keys={…} /> once, then <ArtUse k="…" /> anywhere.
import { ICONS } from "./icons";
import { materialDefs, render } from "./kit";

export function ArtSprite({ keys }: { keys: string[] }) {
  const symbols = [...new Set(keys)]
    .filter((k) => ICONS[k])
    .map((k) => `<symbol id="art-${k}" viewBox="0 0 64 64" overflow="visible">${render(ICONS[k])}</symbol>`)
    .join("");
  return (
    <svg
      aria-hidden
      data-art=""
      style={{ position: "absolute", width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }}
      dangerouslySetInnerHTML={{ __html: `<defs>${materialDefs()}</defs>${symbols}` }}
    />
  );
}

export function ArtUse({ k, size, className = "" }: { k: string; size?: number; className?: string }) {
  return (
    <svg className={`art ${className}`} viewBox="0 0 64 64" style={size ? { width: size, height: size } : undefined} aria-hidden>
      <use href={`#art-${k}`} />
    </svg>
  );
}
