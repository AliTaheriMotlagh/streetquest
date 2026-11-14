// Development only: speak every line people say in the open city (lib/street/barks.ts) with
// Piper running in this browser (WebAssembly; free, nothing to install), saved into
// assets/voices/raw/ — then `npm run assets:voices -- --from=assets/voices/raw` makes the
// files the game ships. On the live site only admins see it (saving files needs npm run dev).
import { notFound } from "next/navigation";
import { devAllowed } from "@/server/devAccess";
import VoiceMaker from "./VoiceMaker";

export const metadata = { title: "Make the voices", robots: { index: false } };

export default async function Page() {
  // Developers, and admins on the live site (server/devAccess.ts).
  if (!(await devAllowed())) notFound();
  return <VoiceMaker />;
}
