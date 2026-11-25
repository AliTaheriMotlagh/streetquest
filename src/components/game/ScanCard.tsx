"use client";
// My shop → "Your store in 3D": the owner scans the real store with a free phone app (Polycam, Scaniverse,
// RealityScan — LiDAR iPhones/iPads give the best rooms; any phone works by photos), exports a .glb and picks it here.
// It's optimised right here in the browser (scan.ts) and uploaded (/api/shops/scan); players who walk into the shop
// in the 3D city then stand inside the real store (drive/interior3d.ts). Turn it so its street side faces the door,
// replace it, or take it down.
import { useEffect, useRef, useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { SCAN_LIMITS } from "@/lib/glbCheck";
import { Button } from "@/components/Button";
import { askConfirm } from "@/components/Dialogs";
import { api } from "./client";
import { useGame } from "./ui";

export type ScanInfo = { version: string; turn: number; bytes: number; triangles: number };
const STEP: Record<string, string> = {
  read: "Reading the scan…",
  mesh: "Making it lighter…",
  textures: "Shrinking the pictures…",
  pack: "Packing it…",
  up: "Uploading…",
};
const mb = (n: number) => fmtNum(Math.round((n / 1048576) * 10) / 10);

export function ScanCard({ shopId }: { shopId: string }) {
  const { act } = useGame();
  const [scan, setScan] = useState<ScanInfo | null | undefined>(undefined);
  const [step, setStep] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    api<{ shop: { scan?: ScanInfo | null } }>(`/api/shops/${shopId}`)
      .then((r) => live && setScan(r.shop.scan ?? null))
      .catch(() => live && setScan(null));
    return () => {
      live = false;
    };
  }, [shopId]);

  const upload = async (f: File) => {
    if (!/\.glb$/i.test(f.name)) return act(async () => Promise.reject(new Error(t("Pick the .glb file your scanning app exported"))));
    await act(async () => {
      try {
        const { optimiseScan } = await import("./scan");
        const r = await optimiseScan(f, setStep);
        setStep("up");
        const res = await fetch(`/api/shops/scan?shop=${encodeURIComponent(shopId)}&turn=${scan?.turn ?? 0}`, { method: "POST", body: r.glb as BlobPart, headers: { "content-type": "model/gltf-binary" } });
        const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string; scan?: ScanInfo };
        if (!res.ok) throw new Error(j.error || t("Server error — please try again"));
        setScan(j.scan ?? null);
        return { message: `${j.message ?? ""} (${t("{a} MB → {b} MB", { a: mb(r.before), b: mb(r.after) })})` };
      } catch (e) {
        // The optimiser's own problems are msg keys.
        throw new Error(t((e as Error).message || "Server error — please try again"));
      } finally {
        setStep(null);
        if (file.current) file.current.value = "";
      }
    });
  };
  const turn = () =>
    scan &&
    act(async () => {
      const r = await api<{ scan: ScanInfo }>("/api/shops/scan", { method: "PATCH", body: { shop: shopId, turn: scan.turn + 1 } });
      setScan(r.scan);
      return {};
    });
  const remove = () =>
    askConfirm(t("Take the 3D scan down?"), { ok: t("Take down") }).then(
      (ok) =>
        ok &&
        act(async () => {
          const r = await api<{ message: string }>(`/api/shops/scan?shop=${encodeURIComponent(shopId)}`, { method: "DELETE" });
          setScan(null);
          return r;
        }),
    );

  return (
    <section className="card scan-card">
      <div className="sec-head"><b>🧊 {t("Your store in 3D")}</b></div>
      {scan ? (
        <p className="small">
          ✅ {t("Players walking into your shop stand inside your real store.")}{" "}
          <span className="muted">{t("{mb} MB · {n} triangles", { mb: mb(scan.bytes), n: fmtNum(scan.triangles) })}</span>
        </p>
      ) : (
        <ol className="small muted scan-steps">
          <li>{t("Scan your store with a free app: Polycam, Scaniverse or RealityScan (an iPhone Pro with LiDAR gives the best room).")}</li>
          <li>{t("Walk slowly round the whole room, then export it as .glb.")}</li>
          <li>{t("Pick that file here — it's made light for phones before it's sent (up to {mb} MB after that).", { mb: mb(SCAN_LIMITS.bytes) })}</li>
        </ol>
      )}
      {step && <p className="small" aria-live="polite">⏳ {t(STEP[step])}</p>}
      <div className="row wrap">
        <input ref={file} type="file" accept=".glb,model/gltf-binary" hidden onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
        <Button className="btn small cyan" disabled={!!step || scan === undefined} onClick={() => file.current?.click()}>
          📤 {scan ? t("Replace the scan") : t("Upload a scan (.glb)")}
        </Button>
        {scan && <Button className="btn small ghost" disabled={!!step} onClick={turn}>↻ {t("Turn it")}</Button>}
        {scan && <Button className="btn small ghost" disabled={!!step} onClick={remove}>🗑️ {t("Take down")}</Button>}
      </div>
    </section>
  );
}
