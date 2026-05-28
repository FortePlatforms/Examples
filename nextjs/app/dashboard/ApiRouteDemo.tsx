"use client";

import { useEffect, useState } from "react";
import type { UserObject } from "@forteplatforms/sdk";

export default function ApiRouteDemo() {
  const [user, setUser] = useState<UserObject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((u) => setUser(u))
      .catch((e) => setError(e instanceof Error ? e.message : "fetch failed"));
  }, []);

  if (error) {
    return (
      <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
        {error}
      </div>
    );
  }
  if (!user) {
    return <div className="text-sm text-neutral-500">Loading…</div>;
  }
  return (
    <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-4 text-xs text-neutral-100">
      {JSON.stringify(user, null, 2)}
    </pre>
  );
}
