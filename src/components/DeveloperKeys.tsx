"use client";
// The Developer screen's key list (/developers): make, copy and revoke API keys for the public
// data API. A new key is shown once; admins also see (and can revoke or re-limit) everyone's.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/components/game/client";
import { Button } from "@/components/Button";
import { t } from "@/lib/i18n";
import type { KeyRow } from "@/server/apiKeys";

type Keys = { keys: KeyRow[]; admin: boolean; max: number };

export function DeveloperKeys() {
  const [data, setData] = useState<Keys | null>(null);
  const [all, setAll] = useState(false);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<Keys>(`/api/developer${all ? "?all=1" : ""}`));
      setErr("");
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [all]);
  useEffect(() => void load(), [load]);

  const make = async () => {
    try {
      const r = await api<{ key: string }>("/api/developer", { body: { name } });
      setFresh(r.key);
      setName("");
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const revoke = async (id: string) => {
    try {
      await api(`/api/developer?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  const limit = async (k: KeyRow) => {
    const v = Number(prompt(t("Requests per minute"), String(k.perMinute)));
    if (!Number.isInteger(v) || v < 1) return;
    try {
      await api("/api/developer", { method: "PATCH", body: { id: k.id, perMinute: v } });
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <section style={{ display: "grid", gap: 10 }}>
      <h3>{t("Your API keys")}</h3>
      {err && <p role="alert" style={{ color: "var(--danger, #e5484d)" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder={t("What is it for? (optional)")} style={{ flex: "1 1 180px", minWidth: 0 }} />
        <Button onClick={make}>{t("Make a key")}</Button>
      </div>
      {fresh && (
        <div className="card" style={{ padding: 10 }}>
          <p>{t("Copy your key now — it won't be shown again.")}</p>
          <code dir="ltr" style={{ wordBreak: "break-all", userSelect: "all" }}>{fresh}</code>
          <div style={{ marginBlockStart: 8 }}>
            <Button onClick={() => navigator.clipboard?.writeText(fresh)}>{t("Copy")}</Button> <Button onClick={() => setFresh("")}>{t("Done")}</Button>
          </div>
        </div>
      )}
      {data?.admin && (
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> {t("Everyone's keys (admin)")}
        </label>
      )}
      {data && !data.keys.length && <p className="muted">{t("No keys yet.")}</p>}
      <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 6 }}>
        {data?.keys.map((k) => (
          <li key={k.id} className="card" style={{ padding: 10, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", opacity: k.revoked ? 0.5 : 1 }}>
            <strong style={{ flex: "1 1 120px" }}>{k.name}</strong>
            <code dir="ltr">{k.prefix}…</code>
            <span className="muted">{t("{n} requests, {limit}/min", { n: k.uses, limit: k.perMinute })}</span>
            {k.owner && <span className="muted">{k.owner}</span>}
            {k.revoked ? (
              <span className="muted">{t("Revoked")}</span>
            ) : (
              <>
                {data.admin && all && <Button onClick={() => limit(k)}>{t("Limit")}</Button>}
                <Button onClick={() => revoke(k.id)}>{t("Revoke")}</Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
