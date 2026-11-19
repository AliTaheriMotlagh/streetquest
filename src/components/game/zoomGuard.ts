// iPad: after turning landscape → portrait Safari can keep the page zoomed in (and stuck there: /play blocks pinch
// zoom, its map and 3D city have their own). When the page is zoomed after a rotation or a viewport change, write
// the viewport meta again with initial-scale=1, which makes Safari drop back to 1, then put the original back.
export function guardPageZoom(): () => void {
  const vv = window.visualViewport;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (!vv || !meta) return () => {};
  const base = meta.content;
  let timer = 0;
  const reset = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      if (Math.abs(vv.scale - 1) < 0.01) return;
      meta.content = `${base.replace(/,?\s*initial-scale=[^,]*/g, "")}, initial-scale=1`;
      requestAnimationFrame(() => requestAnimationFrame(() => (meta.content = base)));
    }, 250);
  };
  window.addEventListener("orientationchange", reset);
  vv.addEventListener("resize", reset);
  return () => {
    clearTimeout(timer);
    window.removeEventListener("orientationchange", reset);
    vv.removeEventListener("resize", reset);
  };
}
