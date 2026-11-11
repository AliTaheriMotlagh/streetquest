"use client";
// Admin → Model update: replace a built-in 3D model without a deploy. Pick a slot, choose a
// .glb — it is checked on the spot with the same rules the server applies (lib/modelCheck.ts:
// size, triangle budget, the parts/bones/clips the game looks up, a believable scale) and shown
// next to what's live now — then publish. Every upload is kept as a version: roll back to any
// earlier one (or the built-in file), with who and when. Players pick a publish up from
// /api/models within about a minute.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/lib/i18n";
import { checkModel, type Problem } from "@/lib/modelCheck";
import { askConfirm } from "./Dialogs";
import { Button } from "./Button";
import { ModelPreview } from "./AdminModelPreview";
import { previewOf, type ObjectsData } from "./AdminObjects";
import { refreshModelManifest } from "./drive/modelOverride";

const kb = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
const when = (d: string | null) => (d ? new Date(d).toLocaleString() : "—");
const say = (p: Problem) => t(p.msg, p.params);

export default function AdminModels({ slot: initial }: { slot?: string }) {
  const [data, setData] = useState<ObjectsData | null>(null);
  const [slot, setSlot] = useState(initial ?? "");
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<{ name: string; buffer: ArrayBuffer; errors: Problem[]; warnings: Problem[]; tris: number } | null>(null);
  const [note, setNote] = useState("");
  /** What sits beside "live now": a picked file, or a version from the history. */
  const [compare, setCompare] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    return fetch("/api/admin/models")
      .then((r) => r.json())
      .then((d: ObjectsData & { error?: string }) => {
        if (d.error) return setErr(d.error);
        setData(d);
        setSlot((s) => s || d.slots[0]?.slot || "");
      })
      .catch(() => setErr(t("Request failed")));
  }, []);
  useEffect(() => void load(), [load]);
  useEffect(() => setSlot((s) => initial ?? s), [initial]);
  // A different slot starts clean.
  useEffect(() => {
    setFile(null);
    setCompare(null);
    setNote("");
    setErr("");
  }, [slot]);

  const info = data?.slots.find((s) => s.slot === slot);
  const versions = useMemo(() => (data?.overrides ?? []).filter((o) => o.slot === slot), [data, slot]);
  const live = versions.find((o) => o.active);
  const sample = useMemo(() => (data && info ? data.objects.find((o) => o.id === info.objects[0]) : undefined), [data, info]);
  const slots = useMemo(() => (data?.slots ?? []).filter((s) => !q || `${s.slot} ${s.label}`.toLowerCase().includes(q.toLowerCase())), [data, q]);

  const call = async (init: RequestInit) => {
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/admin/models", init);
      const d = await r.json();
      if (!r.ok) {
        setErr(d.error ?? t("Request failed"));
        return null;
      }
      return d as { override?: { id: string }; warnings?: string[] };
    } finally {
      setBusy(false);
    }
  };
  const act = async (body: object) => {
    const d = await call({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (d) (refreshModelManifest(), await load());
    return !!d;
  };

  const pick = async (f: File | undefined) => {
    if (!f || !slot) return;
    setErr("");
    if (!/\.glb$/i.test(f.name)) return setErr(t("That file isn't a .glb model — export as glTF Binary (.glb)"));
    const buffer = await f.arrayBuffer();
    const r = checkModel(slot, new Uint8Array(buffer));
    setFile({ name: f.name, buffer, errors: r.errors, warnings: r.warnings, tris: r.info?.tris ?? 0 });
    setCompare(null);
  };

  const upload = async (publish: boolean) => {
    if (!file) return;
    const form = new FormData();
    form.set("slot", slot);
    form.set("note", note || file.name);
    form.set("model", new Blob([file.buffer], { type: "model/gltf-binary" }), file.name);
    const d = await call({ method: "PUT", body: form });
    if (!d?.override) return;
    if (publish) await act({ action: "publish", id: d.override.id });
    else await load();
    setFile(null);
    if (input.current) input.current.value = "";
  };

  if (!data) return err ? <p className="err">{err}</p> : <p>{t("Loading…")}</p>;
  const base = sample ? previewOf(sample) : null;
  const currentSrc = base ?? { url: info?.file };
  const blocked = !!file?.errors.length;

  return (
    <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", alignItems: "start" }}>
      <div className="card" style={{ maxHeight: 560, overflow: "auto" }}>
        <input placeholder={t("🔎 Find a model")} value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 8 }} />
        {slots.map((s) => {
          const ov = data.overrides.find((o) => o.slot === s.slot && o.active);
          return (
            <Button key={s.slot} className={`btn small ${s.slot === slot ? "" : "ghost"}`} style={{ display: "flex", width: "100%", justifyContent: "space-between", marginBottom: 4 }} onClick={() => setSlot(s.slot)}>
              <span>{s.label}{s.objects.length > 1 ? ` (${s.objects.length})` : ""}</span>
              {ov ? <span className="tag live">v{ov.version}</span> : <span className="tag">{t("built-in")}</span>}
            </Button>
          );
        })}
      </div>

      <div style={{ display: "grid", gap: 10, gridColumn: "span 2", minWidth: 0 }}>
        {err && <p className="err" role="alert">{err}</p>}
        <div className="card">
          <div className="row wrap">
            <b className="grow">{info?.label ?? slot} <code className="small muted">{slot}</code></b>
            <span className="small muted">{info ? `${kb(info.bytes ?? 0)} · ${(info.tris ?? 0).toLocaleString()} ${t("triangles")}` : ""}</span>
          </div>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 240px), 1fr))", marginTop: 10 }}>
            <div>
              <div className="small muted" style={{ marginBottom: 4 }}>{live ? t("Live now · v{n}", { n: live.version }) : t("Live now · built-in")}</div>
              <ModelPreview source={currentSrc} />
            </div>
            <div>
              <div className="small muted" style={{ marginBottom: 4 }}>{file ? t("New · {name}", { name: file.name }) : compare ? t("Comparing with") : t("New")}</div>
              {file ? <ModelPreview source={{ buffer: file.buffer, node: base?.node, hide: base?.hide }} /> : compare ? <ModelPreview source={{ rawUrl: compare, node: base?.node, hide: base?.hide }} /> : <div className="small muted" style={{ display: "grid", placeItems: "center", minHeight: 120 }}>{t("Choose a .glb to compare")}</div>}
            </div>
          </div>

          <ul className="small muted" style={{ paddingInlineStart: 18, lineHeight: 1.6 }}>
            <li>{t("File → Export → glTF 2.0: format glTF Binary (.glb), +Y up, Apply Modifiers, Compression (Draco) on, images WebP. Then upload it here.")}</li>
            <li>{t("Keep the part and bone names the game looks up: the check below lists any that are missing.")}</li>
            <li>{t("Largest file: {mb} MB.", { mb: +(data.maxBytes / 1048576).toFixed(0) })} {data.storage === "blob" ? t("Stored in Vercel Blob.") : t("Stored in public/uploads/models (local development).")}</li>
          </ul>
          <input ref={input} type="file" accept=".glb,model/gltf-binary" onChange={(e) => void pick(e.target.files?.[0])} />

          {file && (
            <div style={{ marginTop: 10 }}>
              {file.errors.map((p, i) => <p key={i} className="err small" style={{ margin: "2px 0" }}>✕ {say(p)}</p>)}
              {file.warnings.map((p, i) => <p key={i} className="small" style={{ margin: "2px 0", color: "var(--yellow)" }}>⚠ {say(p)}</p>)}
              {!file.errors.length && <p className="small" style={{ margin: "2px 0", color: "var(--green)" }}>✓ {t("Passes the checks · {n} triangles · {size}", { n: file.tris.toLocaleString(), size: kb(file.buffer.byteLength) })}</p>}
              <input placeholder={t("Note (what changed)")} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} style={{ width: "100%", marginTop: 8 }} />
              <div className="row wrap" style={{ gap: 8, marginTop: 8 }}>
                <Button className="btn green small" disabled={blocked || busy} onClick={() => void upload(true)}>{t("Publish now")}</Button>
                <Button className="btn ghost small" disabled={blocked || busy} onClick={() => void upload(false)}>{t("Save as draft")}</Button>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <div className="row wrap">
            <b className="grow">{t("Versions")}</b>
            {live && (
              <Button className="btn ghost small" disabled={busy} onClick={() => askConfirm(t("Go back to the model that ships with the game?"), { ok: t("Use built-in") }).then((ok) => ok && act({ action: "builtin", slot }))}>
                {t("Use the built-in model")}
              </Button>
            )}
          </div>
          {!versions.length && <p className="small muted">{t("No replacement yet — the game's own model is live.")}</p>}
          {versions.map((v) => (
            <div key={v.id} className="row wrap" style={{ gap: 8, padding: "8px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <span className={`tag ${v.active ? "live" : ""}`}>v{v.version}{v.active ? ` · ${t("live")}` : v.publishedAt ? "" : ` · ${t("draft")}`}</span>
              <span className="small grow" style={{ minWidth: 160 }}>
                {v.note || "—"}
                <span className="muted"> · {kb(v.bytes)} · {v.tris.toLocaleString()} {t("triangles")}</span>
                <br />
                <span className="muted">{t("Uploaded by {who} · {when}", { who: v.createdBy, when: when(v.createdAt) })}{v.publishedAt ? ` · ${t("Published by {who} · {when}", { who: v.publishedBy ?? "?", when: when(v.publishedAt) })}` : ""}</span>
              </span>
              <Button className="btn ghost small" onClick={() => (setFile(null), setCompare(v.url))}>{t("Preview")}</Button>
              {!v.active && <Button className="btn small" disabled={busy} onClick={() => void act({ action: v.publishedAt ? "rollback" : "publish", id: v.id })}>{v.publishedAt ? t("Roll back to this") : t("Publish")}</Button>}
              {!v.active && !v.publishedAt && <Button className="btn ghost small" disabled={busy} onClick={() => void act({ action: "discard", id: v.id })}>{t("Discard")}</Button>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
