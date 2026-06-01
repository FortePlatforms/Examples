"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getSessionToken } from "@/lib/session";

// This is a static website (no server), so routing decisions happen in the browser. Send
// signed-in visitors to the dashboard and everyone else to the login page.
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
