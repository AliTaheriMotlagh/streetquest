"use client";
// Drop-in <button> that knows when its action is running. If onClick returns a promise,
// the button locks until it settles: extra taps are ignored (checked through a ref, so
// a fast double-tap can't slip in before React re-renders) and, if it takes more than a
// moment, the label is swapped for a spinner. Synchronous handlers behave exactly like
// a plain <button>.
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type MouseEvent, type Ref } from "react";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  onClick?: (e: MouseEvent<HTMLButtonElement>) => unknown;
  ref?: Ref<HTMLButtonElement>;
};

/** Quick actions never flash a spinner; slower ones show it after this long. */
const SPINNER_DELAY_MS = 150;

const isThenable = (v: unknown): v is PromiseLike<unknown> => !!v && typeof (v as PromiseLike<unknown>).then === "function";

export function Button({ onClick, disabled, className, children, ...rest }: Props) {
  const running = useRef(false);
  const [busy, setBusy] = useState(false);
  const [spin, setSpin] = useState(false);

  useEffect(() => {
    if (!busy) return setSpin(false);
    const t = setTimeout(() => setSpin(true), SPINNER_DELAY_MS);
    return () => clearTimeout(t);
  }, [busy]);

  const handle = (e: MouseEvent<HTMLButtonElement>) => {
    if (running.current) {
      e.preventDefault();
      return;
    }
    const r = onClick?.(e);
    if (!isThenable(r)) return;
    running.current = true;
    setBusy(true);
    const done = () => {
      running.current = false;
      setBusy(false);
    };
    r.then(done, done);
  };

  return (
    <button {...rest} className={busy ? `${className ?? ""} busy` : className} disabled={disabled || busy} aria-busy={busy || undefined} onClick={handle}>
      {spin ? (
        <>
          <span className="busy-label">{children}</span>
          <span className="busy-spin" aria-hidden />
        </>
      ) : (
        children
      )}
    </button>
  );
}
