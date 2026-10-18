import { getCurrentUser } from "@/lib/forte";
import ApiRouteDemo from "./ApiRouteDemo";
import PreferencesPanel from "./PreferencesPanel";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            Signed in as{" "}
            <strong>{user.fullName || user.userId}</strong>
          </p>
        </div>
        <form action="/api/auth/logout" method="post">
          <button type="submit" className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800">
            Log out
          </button>
        </form>
      </header>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Server Component → projects.getUser
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Rendered on the server. The Forte gateway (or{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">forte proxy</code> locally)
          set <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">X-Forte-User-Id</code> on
          the request, and this page loaded your record with the server-side{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">FORTE_API_TOKEN</code>.
        </p>
        <pre className="overflow-x-auto rounded-lg bg-neutral-900 p-4 text-xs text-neutral-100">
          {JSON.stringify(user, null, 2)}
        </pre>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          API route → /api/me
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          The same lookup, fetched by a Client Component from a JSON route. Use this when you need to
          refresh data without reloading the page.
        </p>
        <ApiRouteDemo />
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500">
          Custom attributes
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Preferences are stored in your{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">customMetadataAttributes</code>.
          Saving calls <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">PUT /api/me/attributes</code>,
          which accepts only the preference keys it knows and writes them with{" "}
          <code className="rounded bg-neutral-200/60 px-1 dark:bg-neutral-800">projects.putUserCustomAttributes</code>.
        </p>
        <PreferencesPanel
          initialAttributes={(user.customMetadataAttributes ?? {}) as Record<string, unknown>}
        />
      </section>
    </main>
  );
}
