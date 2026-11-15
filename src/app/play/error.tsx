"use client";
// If any part of the game crashes, show a recover screen instead of a dead page.
import { useEffect } from "react";
import { useT } from "@/components/I18nProvider";
import { logClient } from "@/components/ClientLog";

export default function PlayError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => {
    console.error(error);
    // Kept with its country and browser for Admin → Browser errors (components/ClientLog.tsx).
    logClient("crash", error.message || String(error));
  }, [error]);
  return (
    <div className="game" style={{ display: "grid", placeItems: "center", padding: 16 }}>
      <div className="modal">
        <div style={{ fontSize: 44 }}>🛠️</div>
        <h2>{t("Something broke")}</h2>
        <p className="muted small">{t("The game hit an error. Your progress is saved on the server.")}</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn" onClick={reset}>{t("Try again")}</button>
          <button className="btn ghost" onClick={() => location.reload()}>{t("Reload")}</button>
        </div>
      </div>
    </div>
  );
}
