"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserObject } from "@forteplatforms/sdk";
import { forte, getProjectId } from "@/lib/forte-browser";
import { backendFetch } from "@/lib/api";
import { getSessionToken, clearSessionToken } from "@/lib/session";
import PreferencesPanel from "./PreferencesPanel";
import NotesPanel from "./NotesPanel";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserObject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getSessionToken()) {
      router.replace("/login");
      return;
    }
    // The backend service loads the user record with its FORTE_API_TOKEN. The browser could also
    // read its own record with forte.users.getAccount; going through the service shows the
    // X-Forte-User-Id handoff.
    backendFetch("/api/me")
      .then((r) => {
        if (r.status === 401) {
          clearSessionToken();
          router.replace("/login");
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((u) => {
        if (u) setUser(u);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load user"));
  }, [router]);

  async function logout() {
    const token = getSessionToken();
    const projectId = getProjectId();
    if (token && projectId) {
      // Best-effort: end the session at Forte. The local token is cleared either way.
      try {
        await forte.users.logout({ projectId, authorization: `Bearer ${token}` });
      } catch {
        // Already expired or invalid; nothing to end.
      }
    }
    clearSessionToken();
    router.replace("/login");
  }

  if (error) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
          {error}
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-neutral-500">Loading…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Signed in as <strong>{user.fullName || user.userId}</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={logout}
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Log out
        </button>
      </header>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Website → Service → projects.getUser
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          This page runs in the browser. It fetched your user record from the backend{" "}
          <strong>service</strong> at{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">GET /api/me</code>,
          sending the session token as a Bearer header. The Forte gateway authenticated that
          request, told the service who you are via{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">X-Forte-User-Id</code>
          , and the service used its server-side{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">FORTE_API_TOKEN</code>{" "}
          to load your record.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-4 text-xs text-neutral-100">
          {JSON.stringify(user, null, 2)}
        </pre>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Custom attributes
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Saving a preference calls{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">PUT /api/me/attributes</code>
          , which updates your{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">customMetadataAttributes</code>{" "}
          through the server-side API. The service accepts only the preference keys it knows.
        </p>
        <PreferencesPanel
          initialAttributes={(user.customMetadataAttributes ?? {}) as Record<string, unknown>}
        />
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Notes (Postgres)
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Preferences live on your Forte user record as a flat map of strings. Notes are rows in a{" "}
          <strong>Forte managed Postgres</strong> database connected to the service:{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">GET</code>,{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">POST</code>,{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">PATCH</code> and{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">DELETE</code> on{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">/api/notes</code>.
          Every query filters on your user id, so you only see and change your own notes.
        </p>
        <NotesPanel />
      </section>
    </main>
  );
}
