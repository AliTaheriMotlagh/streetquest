"use client";
// If any part of the game crashes, show a recover screen instead of a dead page.
import { useEffect } from "react";

export default function PlayError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
    fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "client_error", path: `${location.pathname} ${error.message}`.slice(0, 200) }) }).catch(() => {});
  }, [error]);
  return (
    <div className="game" style={{ display: "grid", placeItems: "center", padding: 16 }}>
      <div className="modal">
        <div style={{ fontSize: 44 }}>🛠️</div>
        <h2>Something broke</h2>
        <p className="muted small">The game hit an error. Your progress is saved on the server.</p>
        <div className="row" style={{ justifyContent: "center" }}>
          <button className="btn" onClick={reset}>Try again</button>
          <button className="btn ghost" onClick={() => location.reload()}>Reload</button>
        </div>
      </div>
    </div>
  );
}
