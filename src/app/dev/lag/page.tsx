// The lag test: every game mode, scripted, measured frame by frame (lib/perf/frameStats.ts).
// Developers, and admins on the live site — run it on the phone you want to know about.
import { notFound } from "next/navigation";
import { devAllowed } from "@/server/devAccess";
import LagPanel from "./LagPanel";

export const metadata = { title: "Lag test", robots: { index: false } };

export default async function Page() {
  if (!(await devAllowed())) notFound();
  return <LagPanel />;
}
