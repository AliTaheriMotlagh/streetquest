// JWT session helpers with no Next.js imports (usable from any runtime).
import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "sq_session";
// If AUTH_SECRET is missing, derive one from the (private) database URL rather than a
// public default, so sessions can't be forged. /api/health warns about it.
const raw = process.env.AUTH_SECRET || createHash("sha256").update(`sq|${process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? "dev"}`).digest("hex");
const secret = () => new TextEncoder().encode(raw);

export async function signSession(userId: string) {
  return new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("365d").sign(secret());
}

export async function verifySession(token: string | undefined): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/**
 * Test mode (simulated GPS, tap-to-move) is open to everyone so the game can be tried
 * without walking around. Set TEST_MODE=off in production to limit it to admins.
 */
export const testModeOpen = () => process.env.TEST_MODE !== "off";
export const canSimulate = (role: string) => process.env.NODE_ENV !== "production" || role === "ADMIN" || testModeOpen();
