// Every developer tool (/dev/*) in one frame: the shared look (dev.css) and the bar over it.
import "./dev.css";
import { DevNav } from "./DevNav";

export default function DevLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="dev" dir="ltr">
      <DevNav />
      {children}
    </div>
  );
}
