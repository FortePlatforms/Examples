"use client";

import { useEffect, useState } from "react";
import { backendFetch } from "@/lib/api";

type Note = {
  id: string;
  body: string;
  created_at: string;
};

export default function NotesPanel() {
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /**
   * Notice there is no user id anywhere in this component. The browser never says which notes it
   * wants — the service derives that from the authenticated session and scopes every query to it.
   */
  async function load() {
    setError(null);
    try {
      const res = await backendFetch("/api/notes");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setNotes((await res.json()) as Note[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load notes");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function send(path: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await backendFetch(path, init);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const ok = await send("/api/notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: draft.trim() }),
    });
    if (ok) setDraft("");
  }

  async function saveEdit(id: string) {
    if (!editingBody.trim()) return;
    const ok = await send(`/api/notes/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: editingBody.trim() }),
    });
    if (ok) setEditingId(null);
  }

  async function remove(id: string) {
    await send(`/api/notes/${id}`, { method: "DELETE" });
  }

  return (
    <div className="space-y-4 rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
      <form onSubmit={create} className="flex items-end gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            New note
          </span>
          <input
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="e.g. Ship the Postgres example"
            className="block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:border-neutral-100 dark:focus:ring-neutral-100"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-neutral-800 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          Add
        </button>
      </form>

      {notes === null ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : notes.length === 0 ? (
        <p className="rounded-md bg-neutral-50 px-4 py-6 text-center text-sm text-neutral-500 dark:bg-neutral-950">
          No notes yet. Add one above — it will still be here after a redeploy.
        </p>
      ) : (
        <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
          {notes.map((note) => (
            <li key={note.id} className="flex items-center gap-3 py-3">
              {editingId === note.id ? (
                <>
                  <input
                    type="text"
                    value={editingBody}
                    onChange={(e) => setEditingBody(e.target.value)}
                    className="flex-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900"
                  />
                  <button
                    type="button"
                    onClick={() => saveEdit(note.id)}
                    disabled={busy}
                    className="rounded-md border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="text-sm text-neutral-500 hover:underline"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  <div className="flex-1">
                    <p className="text-sm">{note.body}</p>
                    <p className="text-xs text-neutral-500">
                      {new Date(note.created_at).toLocaleString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(note.id);
                      setEditingBody(note.body);
                    }}
                    className="text-sm text-neutral-500 hover:underline"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(note.id)}
                    disabled={busy}
                    className="text-sm text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                  >
                    Delete
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
          {error}
        </div>
      )}
    </div>
  );
}
