import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Log in", alternates: { canonical: "/login" } };

export default function Page() {
  return (
    <main className="page">
      <SiteHeader />
      <div className="wrap">
        <Suspense>
          <AuthForm mode="login" />
        </Suspense>
      </div>
    </main>
  );
}
