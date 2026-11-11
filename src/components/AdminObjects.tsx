"use client";
// Admin → Objects: every object in the game in one searchable grid — cars, people, the
// soldier and police, guns, street props, loot, markers, store kinds and the stores' own
// buildings — read from the game's registries (lib/objectCatalog.ts), each with its file,
// size, triangles, licence and where it's used. Models turn on a lazy turntable (drive/turntable.ts).
// "Replace model" opens the update flow (AdminModels.tsx) on that object's slot.
import { useEffect, useMemo, useState } from "react";
import { msg, t } from "@/lib/i18n";
import { OBJECT_KINDS, type CatalogObject, type ObjectKind, type SlotInfo } from "@/lib/objectCatalog";
import type { OverrideView } from "@/server/modelOverrides";
import { Button } from "./Button";
import { ModelPreview, type PreviewSource } from "./AdminModelPreview";

export type ObjectsData = { objects: CatalogObject[]; slots: SlotInfo[]; overrides: OverrideView[]; maxBytes: number; storage: "blob" | "local" };

export const KIND_LABEL: Record<ObjectKind, string> = {
  car: msg("Cars"), person: msg("People"), soldier: msg("Soldier & police"), weapon: msg("Weapons"), prop: msg("Street props"),
  loot: msg("Loot & items"), marker: msg("Markers"), store: msg("Store kinds"), landmark: msg("Store buildings"),
};
const KIND_ICON: Record<ObjectKind, string> = { car: "🚗", person: "🚶", soldier: "🪖", weapon: "🔫", prop: "🌳", loot: "💎", marker: "📍", store: "🏪", landmark: "🏬" };
const FAR = /_far$/;
const SORTS = { name: msg("Name"), tris: msg("Most triangles"), bytes: msg("Biggest file") };

/** What to draw for an object, or null when it has no 3D model. */
export function previewOf(o: CatalogObject): PreviewSource | null {
  if (!o.file) return null;
  if (o.kind === "weapon") return { url: o.file, node: `fp_${o.id.split(":")[1]}` };
  if (o.kind === "prop") return { url: o.file, node: o.name };
  if (o.kind === "car") return { url: o.file, hide: FAR };
  return { url: o.file };
}

const kb = (n: number | null) => (n == null ? "—" : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);

export default function AdminObjects({ onReplace }: { onReplace: (slot: string) => void }) {
  const [data, setData] = useState<ObjectsData | null>(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<ObjectKind | "all">("all");
  const [onlyModels, setOnlyModels] = useState(false);
  const [sort, setSort] = useState<keyof typeof SORTS>("name");

  useEffect(() => {
    fetch("/api/admin/models")
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setData(d)))
      .catch(() => setErr(t("Request failed")));
  }, []);

  const live = useMemo(() => new Map((data?.overrides ?? []).filter((o) => o.active).map((o) => [o.slot, o])), [data]);
  const shown = useMemo(() => {
    if (!data) return [];
    const needle = q.trim().toLowerCase();
    const list = data.objects.filter((o) => {
      if (kind !== "all" && o.kind !== kind) return false;
      if (onlyModels && !o.file) return false;
      if (!needle) return true;
      return [o.id, t(o.name), o.file ?? "", o.credits.map((c) => `${c.title} ${c.author} ${c.license}`).join(" "), o.usedIn.map((u) => t(u)).join(" ")].join(" ").toLowerCase().includes(needle);
    });
    if (sort === "tris") list.sort((a, b) => (b.tris ?? -1) - (a.tris ?? -1));
    else if (sort === "bytes") list.sort((a, b) => (b.bytes ?? -1) - (a.bytes ?? -1));
    return list;
  }, [data, q, kind, onlyModels, sort]);

  if (err) return <p className="err">{err}</p>;
  if (!data) return <p>{t("Loading…")}</p>;
  const count = (k: ObjectKind) => data.objects.filter((o) => o.kind === k).length;
  const totalTris = data.slots.reduce((s, x) => s + (x.tris ?? 0), 0);
  const totalBytes = data.slots.reduce((s, x) => s + (x.bytes ?? 0), 0);

  return (
    <>
      <div className="card">
        <div className="row wrap" style={{ gap: 8 }}>
          <input style={{ flex: "1 1 220px" }} placeholder={t("🔎 Search objects, files, licences, places")} value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={sort} onChange={(e) => setSort(e.target.value as keyof typeof SORTS)} aria-label={t("Sort")}>
            {Object.entries(SORTS).map(([k, l]) => <option key={k} value={k}>{t(l)}</option>)}
          </select>
          <label className="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={onlyModels} onChange={(e) => setOnlyModels(e.target.checked)} />
            {t("Only 3D models")}
          </label>
        </div>
        <div className="row wrap" style={{ gap: 6, marginTop: 10 }}>
          <Button className={`btn small ${kind === "all" ? "" : "ghost"}`} onClick={() => setKind("all")}>{t("All")} · {data.objects.length}</Button>
          {OBJECT_KINDS.map((k) => (
            <Button key={k} className={`btn small ${kind === k ? "" : "ghost"}`} onClick={() => setKind(k)}>{KIND_ICON[k]} {t(KIND_LABEL[k])} · {count(k)}</Button>
          ))}
        </div>
        <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
          {t("{n} model files · {tris} triangles · {size} in all. Generated from the game's own lists, so it never goes stale.", { n: data.slots.length, tris: totalTris.toLocaleString(), size: kb(totalBytes) })}
        </p>
      </div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", marginTop: 10 }}>
        {shown.map((o) => {
          const src = previewOf(o);
          const ov = o.slot ? live.get(o.slot) : undefined;
          return (
            <div key={o.id} className="card" style={{ display: "grid", gap: 6, alignContent: "start" }}>
              {src ? (
                <ModelPreview source={src} label={t(o.name)} />
              ) : (
                <div style={{ height: 110, display: "grid", placeItems: "center", fontSize: 44, background: "rgba(255,255,255,0.04)", borderRadius: 10 }} aria-hidden>{o.emoji ?? KIND_ICON[o.kind]}</div>
              )}
              <div className="row" style={{ gap: 6 }}>
                <b className="grow" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{t(o.name)}</b>
                <span className="tag">{t(KIND_LABEL[o.kind])}</span>
              </div>
              <code className="small muted" style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{o.id}</code>
              <div className="small" style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 8, rowGap: 2 }}>
                <span className="muted">{t("File")}</span><span style={{ overflowWrap: "anywhere" }}>{o.file ? o.file.split("/").pop() : t("drawn from code")}</span>
                <span className="muted">{t("Size")}</span><span>{kb(o.bytes)}{o.size && o.size.some(Boolean) ? ` · ${o.size.map((n) => (n ? n.toFixed(1) : "–")).join(" × ")} m` : ""}</span>
                <span className="muted">{t("Triangles")}</span><span>{o.tris == null ? "—" : o.tris.toLocaleString()}{o.note && o.kind === "car" ? ` (${o.note})` : ""}</span>
                <span className="muted">{t("Licence")}</span>
                <span>{o.credits.length ? o.credits.map((c, i) => <span key={i}>{i ? ", " : ""}{c.url ? <a href={c.url} target="_blank" rel="noreferrer">{c.license}</a> : c.license}</span>) : "—"}</span>
                <span className="muted">{t("Used in")}</span><span>{o.usedIn.map((u) => t(u)).join(" · ")}</span>
              </div>
              {o.slot && (
                <div className="row" style={{ gap: 6, marginTop: 2 }}>
                  {ov && <span className="tag live">{t("Replaced · v{n}", { n: ov.version })}</span>}
                  <span className="grow" />
                  <Button className="btn ghost small" onClick={() => onReplace(o.slot!)}>{t("Replace model")}</Button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {!shown.length && <p className="muted">{t("Nothing matches.")}</p>}
    </>
  );
}
