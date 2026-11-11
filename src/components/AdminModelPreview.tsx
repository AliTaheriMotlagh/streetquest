"use client";
// A turntable of one model for the admin panel (drive/turntable.ts shares a single WebGL
// renderer between all of them). It starts when scrolled into view and stops, freeing the
// model, when it leaves — so a grid of eighty objects holds only the few on screen.
import { useEffect, useRef, useState } from "react";
import { mountPreview } from "./drive/turntable";
import { t } from "@/lib/i18n";

export type PreviewSource = {
  /** A .glb address: a built-in file goes through the published-replacement manifest, so this shows what players get. */
  url?: string;
  /** Fetch these bytes without the manifest (the built-in file itself, or a published upload by exact address). */
  rawUrl?: string;
  /** Bytes in hand (a file the admin just picked). */
  buffer?: ArrayBuffer;
  node?: string;
  hide?: RegExp;
};

export function ModelPreview({ source, width = 280, height = 190, label }: { source: PreviewSource; width?: number; height?: number; label?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return setVisible(true);
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { rootMargin: "120px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const { url, rawUrl, buffer, node, hide } = source;
  useEffect(() => {
    const c = canvas.current;
    if (!visible || !c) return;
    let stop = () => {};
    let gone = false;
    const run = (src: string | ArrayBuffer) => {
      if (!gone) stop = mountPreview(c, { src, node, hide }, setState);
    };
    setState("loading");
    if (buffer) run(buffer);
    else if (rawUrl) {
      fetch(rawUrl)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
        .then(run)
        .catch(() => setState("error"));
    } else if (url) run(url);
    else setState("error");
    return () => {
      gone = true;
      stop();
    };
  }, [visible, url, rawUrl, buffer, node, hide]);

  return (
    <div ref={box} style={{ position: "relative", width: "100%", maxWidth: width, aspectRatio: `${width} / ${height}`, background: "rgba(255,255,255,0.04)", borderRadius: 10, overflow: "hidden" }}>
      <canvas ref={canvas} width={width} height={height} style={{ width: "100%", height: "100%", display: "block" }} aria-label={label} />
      {state !== "ready" && (
        <span className="small muted" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }}>
          {state === "loading" ? t("Loading…") : t("No preview")}
        </span>
      )}
    </div>
  );
}
