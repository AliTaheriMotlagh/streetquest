"use client";
// In-app replacements for window.confirm / window.prompt. Call askConfirm() or
// askText() from anywhere (they return Promises); <DialogHost /> in the root layout
// renders them in the game's style instead of the browser's native pop-up.
import { useEffect, useRef, useState } from "react";

type Opts = { body?: string; ok?: string; cancel?: string; danger?: boolean };
type Req =
  | ({ kind: "confirm"; title: string; resolve: (v: boolean) => void } & Opts)
  | ({ kind: "text"; title: string; value: string; resolve: (v: string | null) => void } & Opts);

let show: ((r: Req) => void) | null = null;
const queue: Req[] = [];

export function askConfirm(title: string, opts: Opts = {}): Promise<boolean> {
  return new Promise((resolve) => open({ kind: "confirm", title, resolve, ...opts }));
}

export function askText(title: string, value = "", opts: Opts = {}): Promise<string | null> {
  return new Promise((resolve) => open({ kind: "text", title, value, resolve, ...opts }));
}

function open(r: Req) {
  if (show) show(r);
  else queue.push(r); // host not mounted yet — shown as soon as it is
}

export function DialogHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [text, setText] = useState("");
  const okRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // One dialog at a time: a second request waits its turn instead of replacing the open
  // one (which would leave the first caller's promise hanging forever).
  const current = useRef<Req | null>(null);
  const present = (r: Req | null) => {
    current.current = r;
    setReq(r);
    if (r?.kind === "text") setText(r.value);
  };
  useEffect(() => {
    show = (r) => (current.current ? queue.push(r) : present(r));
    const pending = queue.shift();
    if (pending) present(pending);
    return () => {
      show = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!req) return;
    (req.kind === "text" ? inputRef.current : okRef.current)?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && done(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [req]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!req) return null;

  function done(ok: boolean) {
    if (!req || current.current !== req) return; // already answered (double tap)
    if (req.kind === "confirm") req.resolve(ok);
    else req.resolve(ok ? text : null);
    present(queue.shift() ?? null);
  }

  return (
    <div className="modal-bg dialog-bg" role="presentation" onClick={() => done(false)}>
      <form
        className="modal dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          done(true);
        }}
      >
        <h2 id="dialog-title" style={{ margin: "0 0 6px", fontSize: 19 }}>{req.title}</h2>
        {req.body && <p className="small muted" style={{ margin: "0 0 12px" }}>{req.body}</p>}
        {req.kind === "text" && <input ref={inputRef} value={text} onChange={(e) => setText(e.target.value)} style={{ marginBottom: 12 }} />}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn ghost" onClick={() => done(false)}>{req.cancel ?? "Cancel"}</button>
          <button ref={okRef} type="submit" className={`btn ${req.danger ? "" : "cyan"}`}>{req.ok ?? "OK"}</button>
        </div>
      </form>
    </div>
  );
}
