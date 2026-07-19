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
    // The user record comes from the backend *service*, which uses its server-side
    // FORTE_API_TOKEN to call forte.projects.getUser. The website never sees that token.
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
    if (token) {
      // Best-effort: invalidate the session with the end-user API, then clear locally.
      try {
        await forte.users.logout({
          projectId: getProjectId(),
          authorization: `Bearer ${token}`,
        });
      } catch {
        // Ignore — we still clear the local token below.
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
          This page is a static website. It fetched the user record from the backend{" "}
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
          An authenticated mutation, also handled by the service. Saving a favorite color or
          incrementing the ping counter calls{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">PUT /api/me/attributes</code>
          , which updates your{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">customMetadataAttributes</code>{" "}
          via the server-side API.
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
          The attributes above live on your Forte user record — a flat map of settings. Notes are
          rows in a <strong>Forte managed Postgres</strong> database attached to the service:{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">GET</code>,{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">POST</code>,{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">PATCH</code> and{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">DELETE</code> on{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">/api/notes</code>.
          Every one of those queries is scoped to your user id in SQL, so the notes below are yours
          and only yours.
        </p>
        <NotesPanel />
      </section>
    </main>
  );
}
