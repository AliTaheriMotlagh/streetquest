"use client";
// One part of the screen that crashed must not take the whole game with it (play/error.tsx is the
// last resort and replaces everything). <Guard where="…"> around a panel, the map, the 3D city or
// a store screen: if it throws while rendering, only that part becomes a small "didn't load" card
// with Try again (and an optional way out), and the error is kept for Admin → Browser errors.
import { Component, type ReactNode } from "react";
import { t } from "@/lib/i18n";
import { logClient } from "./ClientLog";

type Props = {
  /** Which part this is (in the error report: "panel", "map", "drive", "shop"…). */
  where: string;
  children: ReactNode;
  /** A way out besides Try again (close the panel, leave the 3D city). */
  onExit?: () => void;
  exitLabel?: string;
  /** Draw nothing instead of the card (decorations: a map layer, a HUD badge). */
  quiet?: boolean;
};

export class Guard extends Component<Props, { failed: boolean; tries: number }> {
  state = { failed: false, tries: 0 };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(e: Error) {
    console.error(`[${this.props.where}]`, e);
    logClient("crash", `${this.props.where}: ${e?.message || String(e)}`);
  }
  render() {
    if (!this.state.failed) return <Ctx key={this.state.tries}>{this.props.children}</Ctx>;
    if (this.props.quiet) return null;
    const { onExit, exitLabel } = this.props;
    return (
      <div className="guard-card" role="alert">
        <span aria-hidden>🛠️</span>
        <p>{t("This part didn't load. The rest of the game still works.")}</p>
        <div className="row" style={{ justifyContent: "center", gap: 8 }}>
          <button type="button" className="btn small" onClick={() => this.setState((s) => ({ failed: false, tries: s.tries + 1 }))}>{t("Try again")}</button>
          {onExit && <button type="button" className="btn small ghost" onClick={onExit}>{exitLabel ?? t("Close")}</button>}
        </div>
      </div>
    );
  }
}

/** A keyed wrapper, so Try again mounts the part afresh. */
const Ctx = ({ children }: { children: ReactNode }) => <>{children}</>;
