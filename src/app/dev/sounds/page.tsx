// Development only: every sound the game plays, in one panel — listen, replace, record, edit,
// then build (npm run assets:sounds). On the live site only admins see it (saving files needs npm run dev).
import { notFound } from "next/navigation";
import { devAllowed } from "@/server/devAccess";
import SoundsPanel from "./SoundsPanel";

export const metadata = { title: "Every sound", robots: { index: false } };

export default async function Page() {
  // Developers, and admins on the live site (server/devAccess.ts).
  if (!(await devAllowed())) notFound();
  return <SoundsPanel />;
}
