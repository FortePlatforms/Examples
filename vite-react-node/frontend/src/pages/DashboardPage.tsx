import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import type { UserObject } from "@forteplatforms/sdk";
import { forte, getProjectId } from "../lib/forte-browser";
import { backendFetch } from "../lib/api";
import { getSessionToken, clearSessionToken } from "../lib/session";

export default function DashboardPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<UserObject | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!getSessionToken()) {
      navigate("/login", { replace: true });
      return;
    }
    // The user record comes from the backend *service*, which uses its server-side
    // FORTE_API_TOKEN to call forte.projects.getUser. The website never sees that token.
    backendFetch("/api/me")
      .then((r) => {
        if (r.status === 401) {
          clearSessionToken();
          navigate("/login", { replace: true });
          return null;
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((u) => {
        if (u) setUser(u as UserObject);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load user"));
  }, [navigate]);

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
    navigate("/login", { replace: true });
  }

  if (error) {
    return (
      <main className="container">
        <div className="error">{error}</div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="container center">
        <p className="muted">Loading…</p>
      </main>
    );
  }

  return (
    <main className="container">
      <header className="row">
        <div>
          <h1 className="title">Dashboard</h1>
          <p className="muted">
            Signed in as <strong>{user.fullName || user.userId}</strong>
          </p>
        </div>
        <button type="button" className="btn" onClick={logout}>
          Log out
        </button>
      </header>

      <section className="section">
        <h2 className="overline">Website → Service → projects.getUser</h2>
        <p className="muted">
          This page is a static single-page app. It fetched the user record from the backend{" "}
          <strong>service</strong> at <code className="code">GET /api/me</code>, sending the
          session token as a Bearer header. The Forte gateway authenticated that request, told the
          service who you are via <code className="code">X-Forte-User-Id</code>, and the service
          used its server-side <code className="code">FORTE_API_TOKEN</code> to load your record.
        </p>
        <pre className="pre">{JSON.stringify(user, null, 2)}</pre>
      </section>

      <section className="section">
        <h2 className="overline">Custom attributes</h2>
        <p className="muted">
          An authenticated mutation, also handled by the service. Saving a favorite color or
          incrementing the ping counter calls <code className="code">PUT /api/me/attributes</code>,
          which updates your <code className="code">customMetadataAttributes</code> via the
          server-side API.
        </p>
        <PreferencesPanel
          initialAttributes={(user.customMetadataAttributes ?? {}) as Record<string, unknown>}
        />
      </section>
    </main>
  );
}

type Attrs = Record<string, unknown>;

function PreferencesPanel({ initialAttributes }: { initialAttributes: Attrs }) {
  const [attrs, setAttrs] = useState<Attrs>(initialAttributes);
  const [favoriteColor, setFavoriteColor] = useState<string>(
    String(initialAttributes.favoriteColor ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pingCount = Number(attrs.pingCount ?? 0);

  async function update(patch: Record<string, string | number>) {
    setBusy(true);
    setError(null);
    try {
      const res = await backendFetch("/api/me/attributes", {
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

  async function saveColor(e: FormEvent) {
    e.preventDefault();
    await update({ favoriteColor });
  }

  async function ping() {
    await update({ pingCount: pingCount + 1 });
  }

  return (
    <div className="panel">
      <form onSubmit={saveColor} className="panel-form">
        <label className="field">
          <span>Favorite color</span>
          <input
            type="text"
            value={favoriteColor}
            onChange={(e) => setFavoriteColor(e.target.value)}
            placeholder="e.g. teal"
            className="input"
          />
        </label>
        <button type="submit" disabled={busy} className="btn btn-primary">
          Save
        </button>
      </form>

      <div className="counter">
        <div>
          <p className="counter-label">Ping count</p>
          <p className="counter-value">{pingCount}</p>
        </div>
        <button type="button" onClick={ping} disabled={busy} className="btn">
          Ping
        </button>
      </div>

      <details>
        <summary>All attributes (JSON)</summary>
        <pre className="pre">{JSON.stringify(attrs, null, 2)}</pre>
      </details>

      {error && <div className="error">{error}</div>}
    </div>
  );
}
