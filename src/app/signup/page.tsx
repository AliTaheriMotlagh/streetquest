import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/AuthForm";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = { title: "Sign up — play free", alternates: { canonical: "/signup" } };

export default function Page() {
  return (
    <main className="page">
      <SiteHeader />
      <div className="wrap">
        <Suspense>
          <AuthForm mode="signup" />
        </Suspense>
      </div>
    </main>
  );
}
