"use client";
// What the player sees of "download the game" (downloader.ts): a line on the loading screen —
// "Downloading the game · 4.2 of 17 MB · 1.3 MB/s · 9 s left" with its own thin bar — and a row in
// Settings to download it all now (for offline, or on a data-saving connection) or see it's there.
import { useSyncExternalStore } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { etaOf, fmtBytes, IDLE, pctOf, type DownloadState } from "@/lib/gameDownload";
import { downloadState, onDownload, startGameDownload, stopGameDownload } from "./downloader";

export const useGameDownload = (): DownloadState => useSyncExternalStore(onDownload, downloadState, () => IDLE);

const size = (n: number) => {
  const b = fmtBytes(n);
  return b.unit === "MB" ? t("{n} MB", { n: fmtNum(b.n) }) : t("{n} KB", { n: fmtNum(b.n) });
};
const secs = (s: number) => (s < 60 ? t("{n} s left", { n: fmtNum(s) }) : t("{n} min left", { n: fmtNum(Math.ceil(s / 60)) }));

/** The download's line on the loading screen (nothing when there's nothing to download). */
export function DownloadLine() {
  const s = useGameDownload();
  if (s.phase !== "downloading") return null;
  const eta = etaOf(s);
  const parts = [t("{a} of {b}", { a: size(s.done), b: size(s.bytes) }), s.bps > 1024 && t("{v}/s", { v: size(s.bps) }), eta != null && secs(eta)].filter(Boolean);
  return (
    <div className="gdl" role="status" aria-live="off">
      <div className="gdl-head">
        <span>⬇ {t("Downloading the game")}</span>
        <b>{fmtNum(Math.round(pctOf(s)))}%</b>
      </div>
      <div className="gdl-bar" aria-hidden>
        <i style={{ transform: `scaleX(${Math.max(0.02, pctOf(s) / 100)})` }} />
      </div>
      <small>{parts.join(" · ")}</small>
    </div>
  );
}

/** Settings: the game on this phone — download it now, see how far it is, or that it's all there. */
export function DownloadRow() {
  const s = useGameDownload();
  const busy = s.phase === "checking" || s.phase === "downloading";
  return (
    <>
      <div className="row">
        <span className="grow">📦 {t("Game files on this phone")}</span>
        {busy ? (
          <button type="button" className="btn small ghost" onClick={stopGameDownload}>{t("Stop")}</button>
        ) : (
          <button type="button" className="btn small" onClick={() => void startGameDownload(true)}>{s.phase === "done" ? t("Check again") : t("Download")}</button>
        )}
      </div>
      <p className="small muted" style={{ margin: 0 }}>
        {s.phase === "downloading"
          ? t("Downloading… {p}% ({a} of {b})", { p: fmtNum(Math.round(pctOf(s))), a: size(s.done), b: size(s.bytes) })
          : s.phase === "checking"
            ? t("Checking what's already here…")
            : s.phase === "done"
              ? t("All here ({n}): the 3D city starts at once and works offline.", { n: size(s.total) })
              : s.phase === "failed"
                ? t("Some files didn't come — try again on a better connection.")
                : t("Models, sounds and voices, downloaded once so the 3D city starts at once and works offline.")}
      </p>
    </>
  );
}
