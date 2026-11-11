"use client";
// Siktir (سیکتیر): "never again" marks on places. A store card shows how many people said it and
// why (SiktirBar) with a button to say it yourself; a long press on the map, or a tap on a marked
// spot, opens the reason sheet (SiktirSheet). Rules: lib/siktir.ts · server: /api/siktir.
import { useCallback, useEffect, useState } from "react";
import { fmtNum, t } from "@/lib/i18n";
import { REASON_INFO, SIKTIR_LIMITS, SIKTIR_REASONS, siktirCountLabel, siktirReasonsLabel, type SiktirReason } from "@/lib/siktir";
import { Button } from "@/components/Button";
import { api, type LatLng } from "./client";
import { Sheet, useGame } from "./ui";

export type SiktirTarget = LatLng & { placeKey?: string | null; name?: string };
type State = { key: string; count: number; reasons: Partial<Record<SiktirReason, number>>; top: SiktirReason[]; mine: { reason: SiktirReason; note: string } | null };

/** Fired after a mark is made or taken back, so the map layer reloads. */
export const SIKTIR_EVENT = "sq-siktir";

/** A thumbs-down in a circle's worth of space (outline, takes the text colour). */
export function SiktirIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17" />
    </svg>
  );
}

const qs = (p: SiktirTarget) => (p.placeKey ? `placeKey=${encodeURIComponent(p.placeKey)}&` : "") + `lat=${p.lat.toFixed(6)}&lng=${p.lng.toFixed(6)}`;

function useSiktir(p: SiktirTarget) {
  const [s, setS] = useState<State | null>(null);
  const load = useCallback(() => api<State>(`/api/siktir?${qs(p)}`).then(setS).catch(() => {}), [p.lat, p.lng, p.placeKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setS(null);
    void load();
  }, [load]);
  return [s, setS] as const;
}

/** "3 people said Siktir — Dirty · Overpriced", or nothing when nobody has. */
function Summary({ s }: { s: State | null }) {
  if (!s?.count) return null;
  return (
    <p className="siktir-sum">
      <b>{siktirCountLabel(s.count)}</b>
      {!!s.top.length && <span className="muted"> — {siktirReasonsLabel(s.top)}</span>}
    </p>
  );
}

/** Pick a reason, add a note, send. Making a mark again changes it; "take it back" removes it. */
function Reasons({ target, s, setS, onDone }: { target: SiktirTarget; s: State | null; setS: (s: State) => void; onDone?: () => void }) {
  const { toast } = useGame();
  const [reason, setReason] = useState<SiktirReason | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (s?.mine) (setReason(s.mine.reason), setNote(s.mine.note));
  }, [s?.mine?.reason, s?.mine?.note]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = (r: State, msg: string) => {
    setS(r);
    toast({ kind: "social", title: msg });
    window.dispatchEvent(new Event(SIKTIR_EVENT));
    onDone?.();
  };
  const send = async () => {
    if (!reason || busy) return;
    setBusy(true);
    try {
      done(await api<State>("/api/siktir", { body: { lat: target.lat, lng: target.lng, placeKey: target.placeKey ?? null, placeName: target.name ?? "", reason, note } }), t("Noted — thanks for telling people"));
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  const undo = async () => {
    setBusy(true);
    try {
      const r = await api<State>(`/api/siktir?${qs(target)}`, { method: "DELETE" });
      setReason(null);
      setNote("");
      done(r, t("Taken back"));
    } catch (e) {
      toast({ kind: "error", title: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="siktir-form">
      <b className="small">{t("What was wrong?")}</b>
      <div className="filter-chips" role="radiogroup" aria-label={t("What was wrong?")}>
        {SIKTIR_REASONS.map((k) => (
          <button key={k} role="radio" aria-checked={reason === k} className={`filter-chip ${reason === k ? "on" : ""}`} onClick={() => setReason(k)}>
            <span className="lb">{t(REASON_INFO[k].label)}</span>
            {!!s?.reasons[k] && <span className="n">{fmtNum(s.reasons[k]!)}</span>}
          </button>
        ))}
      </div>
      <textarea className="siktir-note" value={note} maxLength={SIKTIR_LIMITS.note} rows={2} onChange={(e) => setNote(e.target.value)} placeholder={t("A few words, if you like (optional)")} aria-label={t("Note")} />
      <div className="row">
        <Button className="btn small siktir-go grow" disabled={!reason || busy} onClick={send}>
          <SiktirIcon /> {s?.mine ? t("Update my Siktir") : t("Siktir")}
        </Button>
        {s?.mine && (
          <Button className="btn small ghost" disabled={busy} onClick={undo}>
            {t("Take it back")}
          </Button>
        )}
      </div>
    </div>
  );
}

/** On a store card: how many said Siktir and why, and the button to say it yourself. */
export function SiktirBar({ placeKey, name, at }: { placeKey: string; name: string; at: LatLng }) {
  const target: SiktirTarget = { lat: at.lat, lng: at.lng, placeKey, name };
  const [s, setS] = useSiktir(target);
  const [open, setOpen] = useState(false);
  return (
    <div className="siktir-bar">
      <div className="row">
        <div className="grow">
          <Summary s={s} />
          {s?.mine && <span className="small muted">{t("You said Siktir: {reason}", { reason: t(REASON_INFO[s.mine.reason].label) })}</span>}
        </div>
        <Button className="btn small ghost siktir-btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <SiktirIcon /> {t("Siktir")}
        </Button>
      </div>
      {open && <Reasons target={target} s={s} setS={setS} onDone={() => setOpen(false)} />}
    </div>
  );
}

/** A spot on the map (long press, or a marked spot tapped): who said what, and say it yourself. */
export function SiktirSheet({ target, onClose }: { target: SiktirTarget; onClose: () => void }) {
  const [s, setS] = useSiktir(target);
  return (
    <Sheet title={target.name ? t("Siktir · {name}", { name: target.name }) : t("Siktir this spot")} onClose={onClose}>
      <Summary s={s} />
      {s && !s.count && <p className="small muted">{t("Nobody has said Siktir about this spot yet.")}</p>}
      <Reasons target={target} s={s} setS={setS} onDone={onClose} />
    </Sheet>
  );
}
