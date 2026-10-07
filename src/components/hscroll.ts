"use client";
// Horizontal rows (tab bars, chip rows) hide their scrollbar for a clean look. On a
// desktop that left no way to reach the hidden items, so for every such row:
// the mouse wheel scrolls sideways, and the row can be dragged with the mouse.
const ROWS = ".tabs, .settings-cats, .admin-side, .hscroll";

export function installHScroll() {
  if (typeof window === "undefined") return () => {};
  const scrollable = (el: Element | null) => {
    const row = el?.closest?.(ROWS) as HTMLElement | null;
    return row && row.scrollWidth > row.clientWidth + 2 ? row : null;
  };

  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // pinch-zoom / trackpad sideways: leave alone
    const row = scrollable(e.target as Element);
    if (!row) return;
    const max = row.scrollWidth - row.clientWidth;
    const atEnd = (e.deltaY > 0 && row.scrollLeft >= max - 1) || (e.deltaY < 0 && row.scrollLeft <= 0);
    if (atEnd) return; // let the page/sheet scroll once the row is at its end
    e.preventDefault();
    row.scrollBy({ left: e.deltaY, behavior: "auto" });
  };

  let drag: { row: HTMLElement; x: number; left: number; moved: boolean } | null = null;
  const onDown = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const row = scrollable(e.target as Element);
    if (row) drag = { row, x: e.clientX, left: row.scrollLeft, moved: false };
  };
  const onMove = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (Math.abs(dx) > 5) drag.moved = true;
    if (drag.moved) {
      drag.row.scrollLeft = drag.left - dx;
      drag.row.classList.add("dragging");
    }
  };
  const onUp = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    d.row.classList.remove("dragging");
    // A drag shouldn't also click the tab it ended on.
    if (d.moved) window.addEventListener("click", (ev) => (ev.stopPropagation(), ev.preventDefault()), { capture: true, once: true });
  };

  document.addEventListener("wheel", onWheel, { passive: false });
  document.addEventListener("pointerdown", onDown);
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  return () => {
    document.removeEventListener("wheel", onWheel);
    document.removeEventListener("pointerdown", onDown);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  };
}
