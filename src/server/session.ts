// JWT session helpers with no Next.js imports, so the socket server can use them.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "sq_session";
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "dev-secret");

export async function signSession(userId: string) {
  return new SignJWT({ sub: userId }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret());
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

/** Simulated GPS (click-to-move) is allowed in development and for admins. */
export const canSimulate = (role: string) => process.env.NODE_ENV !== "production" || role === "ADMIN";
