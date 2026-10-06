"use client";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Sends a first-party page_view on every client navigation. */
export function Analytics() {
  const path = usePathname();
  useEffect(() => {
    fetch("/api/track", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: "page_view", path }), keepalive: true }).catch(() => {});
  }, [path]);
  return null;
}
