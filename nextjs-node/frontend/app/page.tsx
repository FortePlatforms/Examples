"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSessionToken } from "@/lib/session";

// The session token lives in the browser, so the redirect happens here. Signed-in visitors go to
// the dashboard and everyone else to the login page.
export default function Home() {
  const router = useRouter();

  useEffect(() => {
    router.replace(getSessionToken() ? "/dashboard" : "/login");
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-neutral-500">Loading…</p>
    </main>
  );
}
