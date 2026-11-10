// Development only: speak every line people say in the open city (lib/street/barks.ts) with
// Piper running in this browser (WebAssembly; free, nothing to install), saved into
// assets/voices/raw/ — then `npm run assets:voices -- --from=assets/voices/raw` makes the
// files the game ships. Not in production builds.
import { notFound } from "next/navigation";
import VoiceMaker from "./VoiceMaker";

export const metadata = { title: "Make the voices", robots: { index: false } };

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <VoiceMaker />;
}
