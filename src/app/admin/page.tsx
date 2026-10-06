import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AdminPanel } from "@/components/AdminPanel";
import { currentUser } from "@/server/auth";

export const metadata: Metadata = { title: "Admin", robots: { index: false } };

export default async function AdminPage() {
  const u = await currentUser();
  if (!u) redirect("/login?next=/admin");
  if (u.role !== "ADMIN") redirect("/play");
  return <AdminPanel />;
}
