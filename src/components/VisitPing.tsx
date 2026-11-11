"use client";
// Counts a game open (/play) once per browser session for the visit analytics. Renders nothing.
import { useEffect } from "react";

export function VisitPing() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("sq_play_counted") === "1") return;
      sessionStorage.setItem("sq_play_counted", "1");
    } catch {}
    fetch("/api/visits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ path: "play" }) }).catch(() => {});
  }, []);
  return null;
}
