// Development only: every sound the game plays, in one panel — listen, replace, record, edit,
// then build (npm run assets:sounds). Not in production builds.
import { notFound } from "next/navigation";
import SoundsPanel from "./SoundsPanel";

export const metadata = { title: "Every sound", robots: { index: false } };

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <SoundsPanel />;
}
