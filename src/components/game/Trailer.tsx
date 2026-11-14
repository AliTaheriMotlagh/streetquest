"use client";
// A film's trailer in an overlay, played with sound (a tap is the gesture that allows it). Used by
// the cinema card's film rows and by the 3D billboards (tap the board while its trailer plays).
// Cross-origin MP4 from Aparat when the server has one (/api/cinema?trailer=); otherwise a link to the
// film's Aparat page, otherwise nothing is offered. Pure parsing: lib/cinemaTr.ts.
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import type { Trailer } from "@/lib/cinemaTr";
import { Button } from "../Button";
import { api } from "./client";

/** Asks for a film's trailer (null while loading). */
export function useTrailer(id: number | null) {
  const [tr, setTr] = useState<Trailer | null>(null);
  useEffect(() => {
    setTr(null);
    if (id == null) return;
    let live = true;
    api<Trailer>(`/api/cinema?trailer=${id}`).then((r) => live && setTr(r)).catch(() => live && setTr({ url: null, page: null }));
    return () => {
      live = false;
    };
  }, [id]);
  return tr;
}

export function TrailerOverlay({ film, name, onClose }: { film: number; name: string; onClose: () => void }) {
  const tr = useTrailer(film);
  return (
    <div className="trailer-overlay" role="dialog" aria-label={t("Trailer: {film}", { film: name })} onClick={onClose}>
      <div className="trailer-box" onClick={(e) => e.stopPropagation()}>
        <b dir="auto">{name}</b>
        {!tr ? (
          <p className="small muted">⏳ {t("Loading the trailer…")}</p>
        ) : tr.url ? (
          <video src={tr.url} controls autoPlay playsInline crossOrigin="anonymous" />
        ) : tr.page ? (
          <a className="btn small yellow ext-link" href={tr.page} target="_blank" rel="noopener noreferrer">▶️ {t("Watch the trailer on Aparat")}</a>
        ) : (
          <p className="small muted">{t("No trailer for this film")}</p>
        )}
        <Button className="btn small ghost" onClick={onClose}>{t("Close")}</Button>
      </div>
    </div>
  );
}

/** "▶ Trailer" for a film row; opens the overlay. */
export function TrailerButton({ film, name }: { film: number; name: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="film-trailer" onClick={() => setOpen(true)}>▶️ {t("Trailer")}</button>
      {open && <TrailerOverlay film={film} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}
