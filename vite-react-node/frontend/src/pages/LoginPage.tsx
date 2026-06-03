import { useState, type FormEvent, type ReactNode } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ForteClient, type LoginUserResponse } from "@forteplatforms/sdk";
import { setSessionToken } from "../lib/session";

// Login is the one place that talks to Forte directly from the browser, using the end-user API
// (`forte.users.*`). No API token is involved. On success we keep the returned session token and
// forward it to our backend service on subsequent calls.
const forte = new ForteClient();

type Tab = "password" | "otp";

export default function LoginPage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const next = search.get("next") ?? "/dashboard";
  const [tab, setTab] = useState<Tab>("password");

  // In production VITE_FORTE_PROJECT_ID is injected by Forte; locally it comes from .env.local.
  // When it's missing we render a clear message instead of the forms.
  const projectId = import.meta.env.VITE_FORTE_PROJECT_ID;

  function onSuccess(login: LoginUserResponse) {
    const token = login.sessionToken?.sessionToken;
    if (!token) {
      return;
    }
    setSessionToken(token);
    navigate(next, { replace: true });
  }

  return (
    <main className="container container-narrow">
      <h1 className="title">Sign in</h1>
      <p className="muted">
        This website calls the Forte SDK from the browser to sign you in, then talks to a separate
        backend service for everything else.
      </p>

      <div className="tabs">
        <button
          type="button"
          className={"tab" + (tab === "password" ? " active" : "")}
          onClick={() => setTab("password")}
        >
          Password
        </button>
        <button
          type="button"
          className={"tab" + (tab === "otp" ? " active" : "")}
          onClick={() => setTab("otp")}
        >
          One-time code
        </button>
      </div>

      <div className="tab-body">
        {!projectId ? (
          <div className="error">
            VITE_FORTE_PROJECT_ID is not set. On Forte it is injected into your website
            automatically; locally, set it in .env.local.
          </div>
        ) : tab === "password" ? (
          <PasswordForm projectId={projectId} onSuccess={onSuccess} />
        ) : (
          <OtpForm projectId={projectId} onSuccess={onSuccess} />
        )}
      </div>
    </main>
  );
}

function PasswordForm({
  projectId,
  onSuccess,
}: {
  projectId: string;
  onSuccess: (login: LoginUserResponse) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "register">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "register") {
        await forte.users.registerUser({
          projectId,
          registerUserRequest: { email, password },
        });
      }
      const login = await forte.users.passwordLogin({
        projectId,
        passwordLoginRequest: { contactValue: email, password },
      });
      onSuccess(login);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Field label="Email">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
        />
      </Field>
      <Field label="Password">
        <input
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
        />
      </Field>
      {error && <div className="error">{error}</div>}
      <button type="submit" disabled={busy} className="btn btn-primary btn-block">
        {busy ? "Working…" : mode === "register" ? "Create account" : "Sign in"}
      </button>
      <button
        type="button"
        className="link-button"
        onClick={() => setMode(mode === "signin" ? "register" : "signin")}
      >
        {mode === "signin" ? "No account? Register" : "Already have an account? Sign in"}
      </button>
    </form>
  );
}

function OtpForm({
  projectId,
  onSuccess,
}: {
  projectId: string;
  onSuccess: (login: LoginUserResponse) => void;
}) {
  const [email, setEmail] = useState("");
  const [pendingLoginId, setPendingLoginId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // Register first so a brand-new email can sign in; ignore "already exists".
      try {
        await forte.users.registerUser({ projectId, registerUserRequest: { email } });
      } catch {
        // User may already exist; continue to OTP.
      }
      const { pendingLoginId: id } = await forte.users.createOtpLogin({
        projectId,
        createOtpLoginRequest: { email },
      });
      setPendingLoginId(id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send code");
    } finally {
      setBusy(false);
    }
  }

  async function complete(e: FormEvent) {
    e.preventDefault();
    if (!pendingLoginId) return;
    setBusy(true);
    setError(null);
    try {
      const login = await forte.users.completeOtpLogin({
        projectId,
        pendingLoginId,
        completeOtpLoginRequest: { code },
      });
      onSuccess(login);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
      setBusy(false);
    }
  }

  if (!pendingLoginId) {
    return (
      <form onSubmit={start}>
        <Field label="Email">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
          />
        </Field>
        {error && <div className="error">{error}</div>}
        <button type="submit" disabled={busy} className="btn btn-primary btn-block">
          {busy ? "Sending…" : "Send code"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={complete}>
      <p className="muted">
        We sent a code to <strong>{email}</strong>. Enter it below.
      </p>
      <Field label="Code">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="input"
        />
      </Field>
      {error && <div className="error">{error}</div>}
      <button type="submit" disabled={busy} className="btn btn-primary btn-block">
        {busy ? "Verifying…" : "Verify"}
      </button>
      <button
        type="button"
        className="link-button"
        onClick={() => {
          setPendingLoginId(null);
          setCode("");
        }}
      >
        Use a different email
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
