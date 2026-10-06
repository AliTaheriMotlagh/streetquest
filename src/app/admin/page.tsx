import { timingSafeEqual } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPanel } from "@/components/AdminPanel";
import { prisma } from "@/lib/db";
import { currentUser } from "@/server/auth";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

const keyMatches = (given: string | undefined) => {
  const want = process.env.ADMIN_KEY;
  if (!want || !given || given.length !== want.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(want));
};

// There's no login: open /admin?key=<ADMIN_KEY> once in a browser that has played,
// and that player becomes an admin.
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  const u = await currentUser();
  if (!u)
    return (
      <main className="page">
        <div className="auth">
          <h2>Admin</h2>
          <p className="muted">Open the game once in this browser first, then come back.</p>
          <Link className="btn" href="/play">Open the game</Link>
        </div>
      </main>
    );
  if (u.role !== "ADMIN") {
    if (!keyMatches((await searchParams).key)) redirect("/play");
    await prisma.user.update({ where: { id: u.id }, data: { role: "ADMIN" } });
    redirect("/admin");
  }
  return <AdminPanel />;
}
