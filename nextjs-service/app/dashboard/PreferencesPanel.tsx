"use client";

import { useState } from "react";
import type { UserObject } from "@forteplatforms/sdk";

type Attrs = Record<string, unknown>;

export default function PreferencesPanel({ initialAttributes }: { initialAttributes: Attrs }) {
  const [attrs, setAttrs] = useState<Attrs>(initialAttributes);
  const [favoriteColor, setFavoriteColor] = useState<string>(String(initialAttributes.favoriteColor ?? ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pingCount = Number(attrs.pingCount ?? 0);

  async function update(patch: Record<string, string | number>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/me/attributes", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const user = (await res.json()) as UserObject;
      setAttrs((user.customMetadataAttributes ?? {}) as Attrs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveColor(e: React.FormEvent) {
    e.preventDefault();
    await update({ favoriteColor });
  }

  async function ping() {
    await update({ pingCount: pingCount + 1 });
  }

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <form onSubmit={saveColor} className="flex items-end gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Favorite color
          </span>
          <input
            type="text"
            value={favoriteColor}
            onChange={(e) => setFavoriteColor(e.target.value)}
            placeholder="e.g. teal"
            className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Save
        </button>
      </form>

      <div className="flex items-center justify-between rounded-md bg-neutral-50 px-4 py-3 dark:bg-neutral-950">
        <div>
          <p className="text-sm font-medium">Ping count</p>
          <p className="text-2xl font-semibold">{pingCount}</p>
        </div>
        <button
          type="button"
          onClick={ping}
          disabled={busy}
          className="rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Ping
        </button>
      </div>

      <details>
        <summary className="cursor-pointer text-xs text-neutral-500">All attributes (JSON)</summary>
        <pre className="mt-2 overflow-x-auto rounded-md bg-neutral-900 p-3 text-xs text-neutral-100">
          {JSON.stringify(attrs, null, 2)}
        </pre>
      </details>

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
          {error}
        </div>
      )}
    </div>
  );
}
