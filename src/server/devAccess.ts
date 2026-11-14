// Who may open the developer tools (/dev/* pages and /api/dev/*): everyone on a dev server
// (npm run dev), and signed-in admins on the live site. Saving files and running the asset
// scripts need the developer's own disk — the live server's is read-only — so there those
// answer 409 with the reason, while listening, trying voices and Hugging Face still work.
import { currentUser } from "./auth";

export const isDevServer = () => process.env.NODE_ENV !== "production";

export async function devAllowed() {
  if (isDevServer()) return true;
  try {
    return (await currentUser())?.role === "ADMIN";
  } catch {
    return false;
  }
}

export const DISK_ONLY = "Saving files works only on your own computer (npm run dev) — the live server's disk is read-only";
export const diskOnly = () => new Response(DISK_ONLY, { status: 409 });
